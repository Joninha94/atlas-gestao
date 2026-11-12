/**
 * Importação em Lote — Simples Nacional
 *
 * Dois modos:
 *   Excel / CSV  — template com uma empresa por linha + 12 meses de faturamento
 *   PDF PGDAS-D  — múltiplos PDFs (um por mês/empresa), agrupados por CNPJ
 *
 * Em ambos os casos, o resultado final é o mesmo: lista de "linhas" com dados
 * para preview + importação para o Supabase (empresa + atividade + historico).
 */

import { useState, useRef, useCallback } from "react";
import {
  Download, Upload, ArrowLeft, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Info, FileText, FileSpreadsheet,
  Pencil, Check, X,
} from "lucide-react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { calcSimples } from "../utils/calcSimples.js";
import { comparativoMes } from "../utils/calcHibrido.js";
import { PCT_IBS_CBS_DAS_PADRAO } from "../constants/parametrosReforma.js";
import { parsePgdasPdf, agruparPorEmpresa } from "../utils/parsePgdas.js";

const COMP_2027       = "2027-01";
const MESES_PT        = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const REGIME_VALIDOS  = ["regular","hibrido","unificado","mei","pf"];
const ANEXOS_VALIDOS  = ["I","II","III","IV","V"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMeses(yyyyMM, n) {
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseCompetencia(v) {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{4}$/.test(s)) return `${s.slice(3)}-${s.slice(0,2)}`;
  if (/^\d{4}$/.test(s))        return `${s}-01`;
  return "2026-01";
}
function parseNum(v) {
  if (v == null || v === "") return 0;
  const s = String(v).trim().replace(/\s/g,"").replace(/R\$\s*/g,"");
  if (s.includes(",") && s.includes(".")) return parseFloat(s.replace(/\./g,"").replace(",","."))||0;
  if (s.includes(",")) return parseFloat(s.replace(",","."))||0;
  return parseFloat(s)||0;
}
function fmtPct(v) { return `${Number(v).toFixed(2).replace(".",",")}%`; }
function mesLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MESES_PT[+m-1]}/${y}`;
}

// ── Cálculo de comparativo 2027 ───────────────────────────────────────────────
function calcComp2027(anexoEfetivo, rbt12, fatMedio, folha12, compras, regForn, custo, pctB2B) {
  if (fatMedio <= 0) return null;
  const unif = calcSimples({ rbt12, faturamentoMes: fatMedio, annexKey: anexoEfetivo, folha12 });
  if (unif.acimaDolimite) return { erro: "RBT12 acima do limite do Simples Nacional (R$ 4,8M)" };
  const pcts = PCT_IBS_CBS_DAS_PADRAO[anexoEfetivo] || { pct_ibs: 0, pct_cbs: 0 };
  const hib  = comparativoMes({
    dasCompleto: unif.simplesAPagar, pctIbsDas: pcts.pct_ibs, pctCbsDas: pcts.pct_cbs,
    receita: fatMedio, compras, regimeFornecedor: REGIME_VALIDOS.includes(regForn) ? regForn : "regular",
    fatorCreditoUnificado: 0, custoConformidadeExtra: custo, competencia: COMP_2027,
  });
  const cu = unif.simplesAPagar * 12;
  const ch = hib.custo_hibrido * 12;
  const d  = cu - ch;
  return {
    taxaEfetiva: unif.taxaEfetiva, das_mensal: unif.simplesAPagar,
    custo_hibrido_mensal: hib.custo_hibrido,
    custo_unif_anual: cu, custo_hibrido_anual: ch, diferenca_anual: d,
    economia_pct: cu > 0 ? (d/cu)*100 : 0,
    recomendacao: d > 0 ? "HIBRIDO" : (d<=0 && pctB2B>=0.5 ? "AVALIAR" : "UNIFICADO"),
    dasReduzido: hib.dasReduzido, ibs_mensal: hib.ibs_devido, cbs_mensal: hib.cbs_devido,
  };
}

// Calcula histórico mensal de DAS usando RBT12 acumulado dos meses anteriores
function calcMesesHist(meses, anexoEfetivo, folha12) {
  return meses.map((m, i) => {
    const janela = meses.slice(0, i).filter(x => x.faturamento > 0);
    const n = janela.length;
    const soma = janela.reduce((s, x) => s + x.faturamento, 0);
    const rbt12H = n===0 ? 0 : n>=12 ? soma : (soma/n)*12;
    const das = m.faturamento > 0
      ? calcSimples({ rbt12: rbt12H, faturamentoMes: m.faturamento, annexKey: anexoEfetivo, folha12 })
      : null;
    return { ...m, rbt12H, das };
  });
}

// Converte dados brutos em "linha" para o preview e importação
function toLinha(params) {
  const {
    nome, cnpj, folha12=0, pctB2B=0, compras=0, regForn="regular", custo=0,
    anexo, fatorRFlag, meses, inicio,
    // extras para PDF
    rbt12Manual=0, arquivos=[], confiancaAnexo=true,
    cnaeCode="", cnaeNome="", dasPgdas=0, aliqPgdas=0, rbt12Pgdas=0,
  } = params;

  const mesesValidos = meses.filter(m => m.faturamento > 0);
  const somaFat = mesesValidos.reduce((s,m)=>s+m.faturamento,0);
  const nMeses  = mesesValidos.length;
  // RBT12: usa o do PGDAS se disponível e não temos 12 meses, senão calcula da soma
  const rbt12   = rbt12Manual > 0 ? rbt12Manual
                : nMeses >= 12    ? somaFat
                : nMeses > 0      ? (somaFat/nMeses)*12
                : 0;
  const fatMedio = rbt12 / 12;

  // Fator R e anexo efetivo
  const fatorRValor = folha12>0 && rbt12>0 ? Math.floor((folha12/rbt12)*100)/100 : 0;
  const anexoEf     = (anexo==="V" && fatorRFlag && fatorRValor>=0.28) ? "III" : anexo;
  const usouFatorR  = anexoEf !== anexo;

  const calcMeses   = calcMesesHist(meses, anexoEf, folha12);
  const comp2027    = calcComp2027(anexoEf, rbt12, fatMedio, folha12, compras, regForn, custo, pctB2B);

  return {
    empresa:   { nome, cnpj, folha12 },
    atividade: { cnae_code: cnaeCode, cnae_nome: cnaeNome||`Atividade Anexo ${anexoEf}`, anexo: anexoEf, fator_r: fatorRFlag||usouFatorR },
    meses,
    // display
    cnpj, nome, inicio: inicio || meses[0]?.mes || "",
    anexo, anexoEfetivo: anexoEf, usouFatorR,
    pctB2B, compras, regForn, custo, folha12,
    mesesValidos: mesesValidos.length,
    somaFat, rbt12, fatMedio, calcMeses, comp2027,
    selecionada: true,
    // PDF extras
    arquivos, confiancaAnexo, dasPgdas, aliqPgdas, rbt12Pgdas,
    fontePdf: arquivos.length > 0,
    // editável
    anexoEditando: false,
  };
}

// ── Excel parser ──────────────────────────────────────────────────────────────
function parseExcel(rows) {
  // Sinônimos aceitos por coluna (comparação case-insensitive, sem espaços extras)
  const ALIASES = {
    nome:    ["nome","razao social","razão social","nome empresarial","empresa","cliente","contribuinte","razaosocial"],
    cnpj:    ["cnpj","c.n.p.j","cpf/cnpj","cpf cnpj"],
    inicio:  ["inicio_rbt12","inicio rbt12","início rbt12","competencia","competência","inicio","período","periodo","mes inicial","mês inicial"],
    anexo:   ["anexo","tabela","tab","apendice","apêndice","anexo simples"],
    fatorr:  ["fator_r","fator r","fatorr","fator-r","sujeito fator r","fator r simples"],
    cnaec:   ["cnae_codigo","cnae codigo","cnae_code","cnae","codigo cnae","código cnae"],
    cnaed:   ["cnae_descricao","cnae descricao","cnae_descricao","descricao cnae","descrição cnae","atividade"],
    folha:   ["folha_12m","folha 12m","folha12m","folha 12 meses","folha12","folha salarios","folha salários","fs12"],
    pctb2b:  ["pct_b2b","pct b2b","b2b","percentual b2b","% b2b","pct b2b (%)"],
    compras: ["compras_mensais","compras mensais","compras","creditos compras","créditos compras"],
    regforn: ["regime_fornecedores","regime fornecedores","regime fornecedor","regime"],
    custo:   ["custo_conformidade","custo conformidade","custo extra","custo mensal"],
  };

  // Detecta a linha de cabeçalho: primeira linha (dentre as 6 primeiras) com >= 2 colunas não vazias
  // que contenha ao menos um dos termos-chave esperados
  const CHAVES = ["nome","razao","cnpj","anexo","tabela","fat","faturamento"];
  let hdrRowIdx = 0;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const cells = rows[i].map(h => String(h??"").trim().toLowerCase());
    const naoVazias = cells.filter(c => c !== "").length;
    const temChave  = CHAVES.some(k => cells.some(c => c.includes(k)));
    if (naoVazias >= 2 && temChave) { hdrRowIdx = i; break; }
  }

  const hdr = rows[hdrRowIdx].map(h =>
    String(h??"").trim().toLowerCase().replace(/[\s_\-]+/g," ")
  );

  // Busca coluna por qualquer alias
  function col(aliases) {
    for (const a of aliases) {
      const idx = hdr.findIndex(h => h === a || h.includes(a));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const iNome   = col(ALIASES.nome);
  const iCNPJ   = col(ALIASES.cnpj);
  const iInicio = col(ALIASES.inicio);
  const iAnexo  = col(ALIASES.anexo);
  const iFR     = col(ALIASES.fatorr);
  const iCnaeC  = col(ALIASES.cnaec);
  const iCnaeD  = col(ALIASES.cnaed);
  const iFolha  = col(ALIASES.folha);
  const iPctB2B = col(ALIASES.pctb2b);
  const iCompras= col(ALIASES.compras);
  const iRegForn= col(ALIASES.regforn);
  const iCusto  = col(ALIASES.custo);

  // Detecta colunas de faturamento: Fat_01..Fat_12 ou Jan..Dez ou M01..M12 ou meses genéricos
  const FAT_PATTERNS = [
    /^fat[_\s]?(\d{1,2})$/i,
    /^m[eê]s[_\s]?(\d{1,2})$/i,
    /^m(\d{1,2})$/i,
    /^faturamento[_\s]?(\d{1,2})$/i,
  ];
  const MESES_NOMES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez",
                       "janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

  // Tenta achar Fat_01..Fat_12 pelo padrão numérico
  let iFats = Array.from({length:12}, (_,i) => {
    const num = i + 1;
    // Primeiro tenta aliases exatos Fat_01, Fat_1 etc.
    for (const re of FAT_PATTERNS) {
      const idx = hdr.findIndex(h => { const m = h.match(re); return m && parseInt(m[1]) === num; });
      if (idx >= 0) return idx;
    }
    return -1;
  });

  // Se não achou nenhum pelo padrão numérico, tenta pelos nomes dos meses (Jan, Fev…)
  if (iFats.every(i => i < 0)) {
    iFats = MESES_NOMES.slice(0, 12).map((mn, i) => {
      if (i >= 12) return -1;
      const idx = hdr.findIndex(h => h.startsWith(mn.toLowerCase()));
      return idx;
    }).slice(0, 12);
  }

  // Sem nome e sem colunas de faturamento: provavelmente arquivo errado
  if (iNome < 0 && iFats.every(i => i < 0)) {
    return { linhas:[], erros:[`Cabeçalho não reconhecido. Verifique se o arquivo usa o template ou tem colunas "Nome" e "Fat_01"…"Fat_12".`] };
  }

  const erros=[], linhas=[];
  const dataRows = rows.slice(hdrRowIdx + 1);

  dataRows.forEach((row, ri) => {
    if (!row || row.every(c => c==null || c==="")) return;
    const linhaNum = hdrRowIdx + ri + 2; // número da linha no Excel (1-based + cabeçalho)

    const nome = iNome >= 0 ? String(row[iNome]??"").trim() : "";
    if (!nome) { erros.push(`Linha ${linhaNum}: "Nome" obrigatório.`); return; }

    const rawA = iAnexo >= 0
      ? String(row[iAnexo]??"").trim().toUpperCase().replace(/ANEXO\s*/i,"").replace(/\s+/g,"")
      : "";
    if (!ANEXOS_VALIDOS.includes(rawA)) {
      erros.push(`Linha ${linhaNum} (${nome}): Anexo "${row[iAnexo]??""}" inválido — use I, II, III, IV ou V.`);
      return;
    }

    const cnpj     = iCNPJ>=0   ? String(row[iCNPJ]??"").replace(/\D/g,"") : "";
    const inicio   = parseCompetencia(iInicio>=0 ? row[iInicio] : null);
    const fatorR   = iFR>=0 ? String(row[iFR]??"NAO").trim().toUpperCase()==="SIM" : false;
    const cnaeCode = iCnaeC>=0  ? String(row[iCnaeC]??"").replace(/\D/g,"") : "";
    const cnaeNome = iCnaeD>=0  ? String(row[iCnaeD]??"").trim() : "";
    const folha12  = iFolha>=0  ? parseNum(row[iFolha])  : 0;
    const pctB2B   = iPctB2B>=0 ? parseNum(row[iPctB2B])/100 : 0;
    const compras  = iCompras>=0? parseNum(row[iCompras]) : 0;
    const regForn  = iRegForn>=0? String(row[iRegForn]??"regular").trim().toLowerCase() : "regular";
    const custo    = iCusto>=0  ? parseNum(row[iCusto])  : 0;

    const meses = iFats.map((ci,fi) => ({
      mes: addMeses(inicio, fi),
      faturamento: ci>=0 ? parseNum(row[ci]) : 0,
    }));

    if (!meses.some(m=>m.faturamento>0)) {
      erros.push(`Linha ${linhaNum} (${nome}): Nenhum faturamento encontrado.`);
      return;
    }

    linhas.push(toLinha({ nome,cnpj,folha12,pctB2B,compras,regForn,custo,anexo:rawA,fatorRFlag:fatorR,meses,inicio,cnaeCode,cnaeNome,confiancaAnexo:true }));
  });
  return { linhas, erros };
}

async function loadXlsx() {
  return import("xlsx");
}

// ── Template Excel ────────────────────────────────────────────────────────────
async function gerarTemplate() {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const instrucoes = [
    ["IMPORTAÇÃO EM LOTE — Simples Nacional 2027"],[""],
    ["INSTRUÇÕES:"],
    ["• Preencha a aba 'Dados' com um cliente por linha (a partir da linha 3)."],
    ["• A linha 2 é um EXEMPLO — pode apagar ou sobrescrever."],
    ["• Campos obrigatórios: Nome e Anexo."],
    ["• Inicio_RBT12: mês do primeiro Fat_01, ex: 2026-01 (default) ou 01/2026."],[""],
    ["Coluna","Descrição","Exemplo"],
    ["CNPJ","CNPJ (opcional)","12.345.678/0001-00"],
    ["Nome","Razão social / nome fantasia","Empresa Exemplo LTDA"],
    ["Inicio_RBT12","Mês do 1º faturamento (Fat_01)","2026-01"],
    ["Anexo","Anexo Simples Nacional","I, II, III, IV ou V"],
    ["Fator_R","Sujeito ao Fator R?","SIM ou NAO"],
    ["CNAE_Codigo","Código CNAE principal (opcional)","6201501"],
    ["CNAE_Descricao","Descrição da atividade (opcional)","Desenvolvimento de software"],
    ["Folha_12m","Folha 12 meses (R$)","60000"],
    ["Pct_B2B","% receita para PJ (0-100)","30"],
    ["Compras_Mensais","Compras mensais creditáveis IBS/CBS (R$)","20000"],
    ["Regime_Fornecedores","Regime dos fornecedores","regular / hibrido / unificado / mei / pf"],
    ["Custo_Conformidade","Custo extra mensal híbrido (R$)","500"],
    ["Fat_01 a Fat_12","12 meses consecutivos a partir de Inicio_RBT12","45000"],
  ];
  const wsI = XLSX.utils.aoa_to_sheet(instrucoes);
  wsI["!cols"]=[{wch:22},{wch:55},{wch:35}];
  XLSX.utils.book_append_sheet(wb,wsI,"Instruções");

  const headers=["CNPJ","Nome","Inicio_RBT12","Anexo","Fator_R","CNAE_Codigo","CNAE_Descricao",
    "Folha_12m","Pct_B2B","Compras_Mensais","Regime_Fornecedores","Custo_Conformidade",
    ...Array.from({length:12},(_,i)=>`Fat_${String(i+1).padStart(2,"0")}`)];
  const ex=["12.345.678/0001-00","Empresa Exemplo LTDA","2026-01","III","NAO",
    "6201501","Desenvolvimento de programas de computador sob encomenda",60000,30,20000,"regular",500,
    45000,47000,52000,48000,51000,55000,53000,49000,58000,61000,64000,70000];
  const wsD = XLSX.utils.aoa_to_sheet([headers,ex]);
  wsD["!cols"]=[{wch:20},{wch:36},{wch:14},{wch:8},{wch:8},{wch:12},{wch:42},{wch:12},
    {wch:10},{wch:18},{wch:22},{wch:20},...Array.from({length:12},()=>({wch:10}))];
  XLSX.utils.book_append_sheet(wb,wsD,"Dados");
  XLSX.writeFile(wb,"template_importacao_simples_2027.xlsx");
}

// ── Export ────────────────────────────────────────────────────────────────────
async function exportarResultados(linhas) {
  const XLSX = await loadXlsx();
  const sels = linhas.filter(l=>l.selecionada&&l.comp2027&&!l.comp2027.erro);
  if (!sels.length) return;
  const header=["Nome","CNPJ","Anexo","Período","Meses","RBT12","Fat.Médio/mês",
    "Taxa Ef.(%)","DAS Unif./mês","Custo Híbrido/mês","Economia/ano","Economia(%)","Recomendação 2027"];
  const rows=sels.map(l=>{
    const c=l.comp2027;
    return [l.nome,l.cnpj,`${l.anexo}${l.usouFatorR?"→III":""}`,
      l.inicio,l.mesesValidos,l.rbt12.toFixed(2),l.fatMedio.toFixed(2),
      c.taxaEfetiva.toFixed(4),c.das_mensal.toFixed(2),c.custo_hibrido_mensal.toFixed(2),
      c.diferenca_anual.toFixed(2),c.economia_pct.toFixed(2),c.recomendacao];
  });
  const ws=XLSX.utils.aoa_to_sheet([header,...rows]);
  ws["!cols"]=header.map((_,i)=>({wch:i<4?28:18}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Resultado 2027");
  XLSX.writeFile(wb,"resultado_simples_2027.xlsx");
}

// ── Componentes visuais ───────────────────────────────────────────────────────
function RecBadge({ rec }) {
  const cfg={
    HIBRIDO:  {bg:"#10b98120",color:"#10b981",border:"#10b98140",label:"Híbrido"},
    AVALIAR:  {bg:"#f59e0b20",color:"#f59e0b",border:"#f59e0b40",label:"Avaliar"},
    UNIFICADO:{bg:"#6366f120",color:"#6366f1",border:"#6366f140",label:"Unificado"},
  };
  const c=cfg[rec]||cfg.UNIFICADO;
  return <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99,background:c.bg,color:c.color,border:`1px solid ${c.border}`,whiteSpace:"nowrap"}}>{c.label}</span>;
}

function DropZone({ onFiles, multiple=false, accept=".xlsx,.xls,.csv", label, sublabel }) {
  const [dragging,setDragging]=useState(false);
  const ref=useRef(null);
  return (
    <div
      onDragOver={e=>{e.preventDefault();setDragging(true);}}
      onDragLeave={()=>setDragging(false)}
      onDrop={e=>{e.preventDefault();setDragging(false);const fs=[...e.dataTransfer.files];if(fs.length)onFiles(fs);}}
      onClick={()=>ref.current?.click()}
      style={{border:`2px dashed ${dragging?COLORS.river:COLORS.line}`,borderRadius:16,padding:"32px 24px",
        background:dragging?COLORS.river+"08":COLORS.surfaceAlt,textAlign:"center",cursor:"pointer",transition:"all 0.15s"}}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} style={{display:"none"}}
        onChange={e=>{if(e.target.files?.length)onFiles([...e.target.files]);e.target.value="";}}/>
      <Upload size={26} color={dragging?COLORS.river:COLORS.inkMuted} style={{marginBottom:10}}/>
      <div style={{fontWeight:700,color:COLORS.ink,fontSize:14,marginBottom:5}}>{label||"Arraste os arquivos aqui"}</div>
      <div style={{fontSize:12,color:COLORS.inkMuted}}>{sublabel||`ou clique para selecionar — ${accept}`}</div>
    </div>
  );
}

// Tabela mensal de DAS para verificação
function TabelaMeses({ calcMeses, mostrarPgdas=false }) {
  if (!calcMeses?.length) return null;
  const th=(s,right=true)=>(
    <th style={{fontSize:10,fontWeight:700,color:COLORS.inkMuted,textTransform:"uppercase",
      letterSpacing:0.4,padding:"6px 8px",textAlign:right?"right":"left",
      borderBottom:`1px solid ${COLORS.line}`,whiteSpace:"nowrap"}}>{s}</th>
  );
  return (
    <div style={{overflowX:"auto",marginTop:10}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr style={{background:COLORS.surfaceAlt}}>
            {th("Mês",false)}{th("Faturamento")}{th("RBT12 base")}{th("Taxa")}{th("DAS calculado")}
            {mostrarPgdas&&th("DAS PGDAS")}{mostrarPgdas&&th("Dif.")}
            {th("Obs.",false)}
          </tr>
        </thead>
        <tbody>
          {calcMeses.map((m,i)=>{
            const dif=mostrarPgdas&&m.das_pgdas>0&&m.das?.simplesAPagar>0
              ? m.das.simplesAPagar - m.das_pgdas : null;
            return (
              <tr key={i} style={{borderBottom:`1px solid ${COLORS.line}40`,background:i%2===0?"transparent":COLORS.surfaceAlt+"60"}}>
                <td style={{padding:"4px 8px",fontWeight:600,color:COLORS.ink}}>{mesLabel(m.mes)}</td>
                <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace",color:m.faturamento>0?COLORS.ink:COLORS.inkMuted}}>
                  {m.faturamento>0?formatBRL(m.faturamento):"—"}
                </td>
                <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace",color:COLORS.inkMuted}}>
                  {m.rbt12H>0?formatBRL(m.rbt12H):"—"}
                </td>
                <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace",color:COLORS.river}}>
                  {m.das?fmtPct(m.das.taxaEfetiva):"—"}
                </td>
                <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:COLORS.river}}>
                  {m.das?formatBRL(m.das.simplesAPagar):"—"}
                </td>
                {mostrarPgdas&&<td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace",color:COLORS.inkMuted}}>
                  {m.das_pgdas>0?formatBRL(m.das_pgdas):"—"}
                </td>}
                {mostrarPgdas&&<td style={{padding:"4px 8px",textAlign:"right",fontFamily:"monospace",
                  color:dif==null?"transparent":Math.abs(dif)<1?"#10b981":COLORS.amber}}>
                  {dif!=null?(dif>0?"▲ ":"▼ ")+formatBRL(Math.abs(dif)):"—"}
                </td>}
                <td style={{padding:"4px 8px",fontSize:10,color:COLORS.inkMuted,whiteSpace:"nowrap"}}>
                  {m.das?.acimaDolimite?"⚠ Limite":m.rbt12H===0&&m.faturamento>0?"Anualizando":m.das?.usouFatorR?"⚡ FatR":""}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{borderTop:`2px solid ${COLORS.line}`}}>
            <td colSpan={2} style={{padding:"5px 8px",fontSize:10,color:COLORS.inkMuted,fontWeight:700}}>
              {calcMeses.filter(m=>m.faturamento>0).length} meses com faturamento
            </td>
            <td colSpan={mostrarPgdas?5:2}/>
            <td style={{padding:"5px 8px",textAlign:"right",fontWeight:700,fontSize:11,color:COLORS.river}}>
              Total DAS: {formatBRL(calcMeses.reduce((s,m)=>s+(m.das?.simplesAPagar||0),0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Card de comparativo 2027
function Card2027({ comp }) {
  if (!comp) return null;
  if (comp.erro) return (
    <div style={{padding:"10px 14px",background:COLORS.danger+"10",borderRadius:10,border:`1px solid ${COLORS.danger}30`,fontSize:12,color:COLORS.danger}}>
      {comp.erro}
    </div>
  );
  const econ=comp.diferenca_anual, cor=econ>0?"#10b981":"#6366f1";
  return (
    <div style={{background:COLORS.surfaceAlt,borderRadius:12,border:`1px solid ${COLORS.line}`,overflow:"hidden"}}>
      <div style={{padding:"7px 14px",borderBottom:`1px solid ${COLORS.line}`,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,fontWeight:700,color:COLORS.inkMuted,textTransform:"uppercase",letterSpacing:0.5}}>
          Projeção 2027 — CBS 8,8% + IBS 0,1%
        </span>
        <RecBadge rec={comp.recomendacao}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderBottom:`1px solid ${COLORS.line}`}}>
        {[
          {label:"DAS Unificado/mês",value:formatBRL(comp.das_mensal),color:COLORS.river},
          {label:"Custo Híbrido/mês",value:formatBRL(comp.custo_hibrido_mensal),color:"#10b981"},
          {label:"Diferença/ano",value:(econ>0?"+":"")+formatBRL(econ),color:cor},
        ].map((it,i)=>(
          <div key={i} style={{padding:"10px 12px",borderRight:i<2?`1px solid ${COLORS.line}`:"none",textAlign:"center"}}>
            <div style={{fontSize:10,color:COLORS.inkMuted,marginBottom:4,textTransform:"uppercase"}}>{it.label}</div>
            <div style={{fontSize:14,fontWeight:800,color:it.color,fontFamily:"monospace"}}>{it.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",padding:"7px 0"}}>
        {[
          {label:"DAS reduzido",value:formatBRL(comp.dasReduzido)},
          {label:"IBS + CBS",value:formatBRL(comp.ibs_mensal+comp.cbs_mensal)},
          {label:"Economia %",value:comp.economia_pct>0?`−${comp.economia_pct.toFixed(1)}%`:`+${Math.abs(comp.economia_pct).toFixed(1)}%`},
        ].map((it,i)=>(
          <div key={i} style={{padding:"4px 12px",textAlign:"center"}}>
            <div style={{fontSize:10,color:COLORS.inkMuted}}>{it.label}</div>
            <div style={{fontSize:12,fontWeight:600,color:COLORS.ink,fontFamily:"monospace"}}>{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Resumo total
function Resumo({ linhas }) {
  const sels=linhas.filter(l=>l.selecionada);
  const h=sels.filter(l=>l.comp2027?.recomendacao==="HIBRIDO").length;
  const a=sels.filter(l=>l.comp2027?.recomendacao==="AVALIAR").length;
  const u=sels.filter(l=>l.comp2027?.recomendacao==="UNIFICADO").length;
  const eco=sels.reduce((s,l)=>s+(l.comp2027?.diferenca_anual>0?l.comp2027.diferenca_anual:0),0);
  const box=(label,val,color)=>(
    <div style={{flex:1,background:COLORS.surface,borderRadius:12,border:`1px solid ${COLORS.line}`,
      padding:"13px 14px",textAlign:"center",minWidth:110}}>
      <div style={{fontSize:10,color:COLORS.inkMuted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:5}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color}}>{val}</div>
    </div>
  );
  return (
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
      {box("Selecionadas",sels.length,COLORS.ink)}
      {box("→ Híbrido",h,"#10b981")}
      {box("→ Avaliar",a,"#f59e0b")}
      {box("→ Unificado",u,"#6366f1")}
      {box("Economia total/ano",formatBRL(eco),COLORS.river)}
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────────────────
export function ImportacaoLoteView({ onBack, batchImport, onImportSuccess }) {
  const [fase,    setFase]    = useState("upload");  // upload|preview|importing|done
  const [modo,    setModo]    = useState("excel");   // excel|pdf
  const [nomeArq, setNomeArq] = useState("");
  const [linhas,  setLinhas]  = useState([]);
  const [erros,   setErros]   = useState([]);
  const [expandidos,setExpandidos]=useState(new Set());
  const [mostrarErros,setMostrarErros]=useState(false);
  const [progresso,setProgresso]=useState({atual:0,total:0,nome:""});
  const [resultados,setResultados]=useState([]);
  // Estado de parsing de PDFs
  const [pdfProgresso,setPdfProgresso]=useState({processados:0,total:0,atual:""});
  const [pdfProcessando,setPdfProcessando]=useState(false);

  // ── Funções de estado ───────────────────────────────────────────────────
  function toggleSelect(i){setLinhas(prev=>prev.map((l,idx)=>idx===i?{...l,selecionada:!l.selecionada}:l));}
  function toggleAll(){const todas=linhas.every(l=>l.selecionada);setLinhas(prev=>prev.map(l=>({...l,selecionada:!todas})));}
  function toggleExpand(i){setExpandidos(prev=>{const n=new Set(prev);n.has(i)?n.delete(i):n.add(i);return n;});}
  function setAnexo(i,novoAnexo){
    setLinhas(prev=>prev.map((l,idx)=>{
      if(idx!==i) return l;
      const novaMeses=l.meses;
      const novaLinha=toLinha({
        ...l.empresa,...l,
        anexo:novoAnexo, fatorRFlag:l.atividade.fator_r,
        meses:novaMeses,
        rbt12Manual:l.rbt12Pgdas>0&&l.mesesValidos<12?l.rbt12Pgdas:0,
        arquivos:l.arquivos, confiancaAnexo:true,
        cnaeCode:l.atividade.cnae_code, cnaeNome:l.atividade.cnae_nome,
        dasPgdas:l.dasPgdas, aliqPgdas:l.aliqPgdas, rbt12Pgdas:l.rbt12Pgdas,
      });
      return {...novaLinha,selecionada:l.selecionada};
    }));
  }

  // ── Excel ───────────────────────────────────────────────────────────────
  const handleExcelFile=useCallback((files)=>{
    const file=files[0];
    setNomeArq(file.name);
    const reader=new FileReader();
    reader.onload=async e=>{
      try{
        const XLSX = await loadXlsx();
        const wb=XLSX.read(e.target.result,{type:"array"});
        const nm=wb.SheetNames.includes("Dados")?"Dados":wb.SheetNames[0];
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[nm],{header:1,defval:""});
        if(rows.length<2){setErros(["Arquivo sem dados. Use o template."]);setLinhas([]);setFase("preview");return;}
        const{linhas:parsed,erros:errosParse}=parseExcel(rows);
        setLinhas(parsed);setErros(errosParse);setExpandidos(new Set());setFase("preview");
      }catch(err){setErros([`Erro ao ler: ${err.message}`]);setLinhas([]);setFase("preview");}
    };
    reader.readAsArrayBuffer(file);
  },[]);

  // ── PDF ─────────────────────────────────────────────────────────────────
  const handlePdfFiles=useCallback(async(files)=>{
    setPdfProcessando(true);
    setNomeArq(`${files.length} arquivo${files.length!==1?"s":""} PDF`);

    // Fase 1: leitura dos PDFs
    const registros=[];
    const errosPdf=[];
    for(let i=0;i<files.length;i++){
      const f=files[i];
      setPdfProgresso({fase:"pdf",processados:i,total:files.length,atual:f.name});
      try{
        const rec=await parsePgdasPdf(f);
        if(rec.erro) errosPdf.push(`${f.name}: ${rec.erro}`);
        else registros.push(rec);
      }catch(e){
        errosPdf.push(`${f.name}: ${e.message}`);
      }
    }

    // Fase 2: agrupa por CNPJ/nome
    const grupos=agruparPorEmpresa(registros);
    const empresasList=[...grupos.values()];

    // Fase 3: consulta CNPJ API para cada empresa que tem CNPJ
    const cnpjApiMap=new Map(); // cnpj → dados da API
    const comCnpj=empresasList.filter(e=>e.cnpj);
    for(let i=0;i<comCnpj.length;i++){
      const emp=comCnpj[i];
      setPdfProgresso({fase:"cnpj",processados:i,total:comCnpj.length,atual:emp.nome});
      try{
        const res=await fetch(`https://publica.cnpj.ws/cnpj/${emp.cnpj}`);
        if(res.ok){
          const json=await res.json();
          cnpjApiMap.set(emp.cnpj,json);
        }
      }catch(_){}
      // Respeita rate-limit da API (3 req/min ~= 300ms entre chamadas)
      if(i<comCnpj.length-1) await new Promise(r=>setTimeout(r,350));
    }
    setPdfProgresso({fase:"cnpj",processados:comCnpj.length,total:comCnpj.length,atual:""});

    // Fase 4: monta linhas com dados enriquecidos
    const linhasPdf=[];
    for(const emp of grupos.values()){
      const api=emp.cnpj?cnpjApiMap.get(emp.cnpj):null;
      const apiEst=api?.estabelecimento;

      // Prefere razão social da Receita Federal; cai para o nome do PDF
      const nomeOficial=api?.razao_social||emp.nome;
      const cnaeCode=apiEst?.cnae_fiscal_principal?.codigo||"";
      const cnaeNome=apiEst?.cnae_fiscal_principal?.descricao||"";
      // Folha: usa a do PDF; se API retornar algo futuramente, pode sobrepor aqui
      const folha12=emp.folha12||0;

      const nMeses=emp.meses.filter(m=>m.faturamento>0).length;
      const rbt12Manual=emp.rbt12Ultimo>0&&nMeses<12?emp.rbt12Ultimo:0;

      const linha=toLinha({
        nome:nomeOficial, cnpj:emp.cnpj||"", folha12,
        pctB2B:0, compras:0, regForn:"regular", custo:0,
        anexo:emp.anexo, fatorRFlag:emp.fatorR,
        meses:emp.meses.map(m=>({mes:m.mes,faturamento:m.faturamento,das_pgdas:m.das_pgdas,aliq_pgdas:m.aliq_pgdas})),
        inicio:emp.meses[0]?.mes||"",
        rbt12Manual, arquivos:emp.arquivos,
        confiancaAnexo:emp.confiancaAnexo,
        dasPgdas:emp.dasUltimo, aliqPgdas:emp.aliqUltima, rbt12Pgdas:emp.rbt12Ultimo,
        cnaeCode, cnaeNome,
      });

      // Dados extras da API para exibição no detalhe expandido
      linha.apiData=api;
      linha.nomePdf=emp.nome; // nome original do PDF (pode diferir da razão social)

      linhasPdf.push(linha);
    }
    setLinhas(linhasPdf);
    setErros(errosPdf);
    setExpandidos(new Set());
    setPdfProcessando(false);
    setFase("preview");
  },[]);

  // ── Importar ────────────────────────────────────────────────────────────
  async function handleImportar(){
    const batch=linhas.filter(l=>l.selecionada);
    if(!batch.length) return;
    setFase("importing");
    const res=await batchImport(batch,p=>setProgresso(p));
    setResultados(res);
    setFase("done");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: UPLOAD
  // ─────────────────────────────────────────────────────────────────────────
  if(fase==="upload") return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={onBack} style={{background:COLORS.surfaceAlt,border:`1px solid ${COLORS.line}`,borderRadius:9,padding:"7px 12px",color:COLORS.inkMuted,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
          <ArrowLeft size={13}/> Voltar
        </button>
        <div>
          <div style={{fontWeight:800,fontSize:17,color:COLORS.ink}}>Importação em Lote — Simples Nacional 2027</div>
          <div style={{fontSize:12,color:COLORS.inkMuted}}>Cadastre empresas + histórico e compare Híbrido × Unificado em uma única operação</div>
        </div>
      </div>

      {/* Passo 1: Escolher modo */}
      <div style={{background:COLORS.surface,borderRadius:16,border:`1px solid ${COLORS.line}`,padding:24,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <span style={{width:28,height:28,borderRadius:"50%",background:COLORS.river,color:COLORS.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>1</span>
          <span style={{fontWeight:700,fontSize:15,color:COLORS.ink}}>Escolha o tipo de arquivo</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[
            {
              id:"excel", Icon:FileSpreadsheet, titulo:"Planilha Excel / CSV",
              desc:"Use nosso template com uma empresa por linha e os 12 meses de faturamento. Ideal para importações em massa.",
              badge:"Template disponível",
            },
            {
              id:"pdf", Icon:FileText, titulo:"PDF — PGDAS-D",
              desc:"Importe diretamente das declarações do PGDAS-D. Envie um ou vários PDFs por empresa (um por mês). O sistema agrupa por CNPJ.",
              badge:"Múltiplos PDFs",
            },
          ].map(({id,Icon,titulo,desc,badge})=>(
            <button key={id} onClick={()=>setModo(id)} style={{
              textAlign:"left",padding:20,borderRadius:14,cursor:"pointer",
              border:`2px solid ${modo===id?COLORS.river:COLORS.line}`,
              background:modo===id?COLORS.river+"0D":COLORS.surfaceAlt,
              transition:"all 0.15s",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:modo===id?COLORS.river+"20":COLORS.line+"40",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Icon size={18} color={modo===id?COLORS.river:COLORS.inkMuted}/>
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:modo===id?COLORS.river:COLORS.ink}}>{titulo}</div>
                  <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:99,
                    background:modo===id?COLORS.river+"20":COLORS.surfaceAlt,
                    color:modo===id?COLORS.river:COLORS.inkMuted,border:`1px solid ${modo===id?COLORS.river+"40":COLORS.line}`}}>
                    {badge}
                  </span>
                </div>
              </div>
              <div style={{fontSize:12,color:COLORS.inkMuted,lineHeight:1.5}}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Passo 2: Download template (só Excel) */}
      {modo==="excel"&&(
        <div style={{background:COLORS.surface,borderRadius:16,border:`1px solid ${COLORS.line}`,padding:24,marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{width:28,height:28,borderRadius:"50%",background:COLORS.river,color:COLORS.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>2</span>
            <span style={{fontWeight:700,fontSize:15,color:COLORS.ink}}>Baixe o modelo de planilha</span>
          </div>
          <div style={{fontSize:13,color:COLORS.inkMuted,marginBottom:14,lineHeight:1.6}}>
            Preencha com CNPJ, nome, <strong>Inicio_RBT12</strong> (ex: 2026-01), Anexo, CNAE e os 12 meses de faturamento. O campo <code>Inicio_RBT12</code> define qual mês real é <strong>Fat_01</strong>.
          </div>
          <button onClick={gerarTemplate} style={{background:COLORS.river+"15",border:`1px solid ${COLORS.river}40`,borderRadius:10,padding:"10px 18px",color:COLORS.river,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontSize:13}}>
            <Download size={15}/> Baixar modelo (.xlsx)
          </button>
        </div>
      )}

      {/* Passo 2/3: Upload */}
      <div style={{background:COLORS.surface,borderRadius:16,border:`1px solid ${COLORS.line}`,padding:24,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <span style={{width:28,height:28,borderRadius:"50%",background:COLORS.river,color:COLORS.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>
            {modo==="excel"?"3":"2"}
          </span>
          <span style={{fontWeight:700,fontSize:15,color:COLORS.ink}}>
            {modo==="excel"?"Importe a planilha preenchida":"Envie os PDFs do PGDAS-D"}
          </span>
        </div>

        {modo==="excel"&&!pdfProcessando&&(
          <DropZone onFiles={handleExcelFile} accept=".xlsx,.xls,.csv"
            label="Arraste a planilha aqui" sublabel="ou clique para selecionar — .xlsx, .xls ou .csv"/>
        )}

        {modo==="pdf"&&!pdfProcessando&&(
          <>
            <DropZone onFiles={handlePdfFiles} multiple accept=".pdf"
              label="Arraste um ou mais PDFs do PGDAS-D aqui" sublabel="ou clique para selecionar — .pdf · múltiplos arquivos aceitos"/>
            <div style={{marginTop:12,fontSize:12,color:COLORS.inkMuted,lineHeight:1.6,display:"flex",gap:8,alignItems:"flex-start"}}>
              <Info size={13} color={COLORS.inkMuted} style={{flexShrink:0,marginTop:2}}/>
              <div>
                Cada PDF representa <strong>um mês</strong> de apuração de <strong>uma empresa</strong>. Para importar o histórico completo, envie os 12 PDFs mensais da empresa de uma vez.
                O sistema agrupa automaticamente por CNPJ — se dois PDFs tiverem o mesmo CNPJ, são tratados como meses diferentes da mesma empresa.
                <br/><strong>Atenção:</strong> funciona apenas com PDFs gerados digitalmente (não escaneados).
              </div>
            </div>
          </>
        )}

        {pdfProcessando&&(
          <div style={{textAlign:"center",padding:"32px 24px"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.river} strokeWidth="2" strokeLinecap="round" style={{animation:"spin 0.8s linear infinite",marginBottom:12}}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            {pdfProgresso.fase==="cnpj"?(
              <>
                <div style={{fontWeight:700,color:COLORS.ink,fontSize:15,marginBottom:4}}>
                  Consultando CNPJ na Receita Federal… ({pdfProgresso.processados+1}/{pdfProgresso.total})
                </div>
                <div style={{fontSize:12,color:COLORS.inkMuted,marginBottom:2}}>{pdfProgresso.atual}</div>
                <div style={{fontSize:11,color:COLORS.inkMuted,marginBottom:10}}>Aguardando entre consultas para respeitar o limite da API…</div>
              </>
            ):(
              <>
                <div style={{fontWeight:700,color:COLORS.ink,fontSize:15,marginBottom:6}}>
                  Lendo PDF {pdfProgresso.processados+1} de {pdfProgresso.total}…
                </div>
                <div style={{fontSize:12,color:COLORS.inkMuted}}>{pdfProgresso.atual}</div>
              </>
            )}
            <div style={{width:"100%",maxWidth:300,margin:"14px auto 0",height:5,background:COLORS.line,borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:99,background:COLORS.river,
                width:`${pdfProgresso.total>0?(pdfProgresso.processados/pdfProgresso.total)*100:0}%`,transition:"width 0.3s"}}/>
            </div>
          </div>
        )}
      </div>

      {/* Notas PDF */}
      {modo==="pdf"&&!pdfProcessando&&(
        <div style={{display:"flex",gap:8,alignItems:"flex-start",padding:"12px 16px",background:COLORS.surfaceAlt,borderRadius:12,border:`1px solid ${COLORS.line}`}}>
          <Info size={14} color={COLORS.inkMuted} style={{flexShrink:0,marginTop:2}}/>
          <div style={{fontSize:12,color:COLORS.inkMuted,lineHeight:1.6}}>
            <strong>O que é extraído do PGDAS-D:</strong> CNPJ, Razão Social, Período de Apuração, Receita Bruta do Período, RBT12 (usado diretamente quando há menos de 12 meses importados), DAS declarado, Alíquota efetiva e Fator R.
            O Anexo é inferido dos tributos (ICMS→I/II, ISS→III, IPI→II) — verifique e corrija se necessário na pré-visualização.
            Comparação Híbrido × Unificado usa IVA Dual 2027 (Res. CGSN 190/2026).
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: IMPORTING
  // ─────────────────────────────────────────────────────────────────────────
  if(fase==="importing") return (
    <div style={{textAlign:"center",padding:"80px 24px"}}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.river} strokeWidth="2" strokeLinecap="round" style={{animation:"spin 0.8s linear infinite",marginBottom:20}}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
      <div style={{fontWeight:800,fontSize:17,color:COLORS.ink,marginBottom:8}}>
        Importando {progresso.atual} de {progresso.total}…
      </div>
      <div style={{fontSize:13,color:COLORS.inkMuted,marginBottom:20}}>{progresso.nome}</div>
      <div style={{width:"100%",maxWidth:360,margin:"0 auto",height:6,background:COLORS.line,borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:99,background:COLORS.river,
          width:`${progresso.total>0?(progresso.atual/progresso.total)*100:0}%`,transition:"width 0.3s"}}/>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: DONE
  // ─────────────────────────────────────────────────────────────────────────
  if(fase==="done"){
    const ok=resultados.filter(r=>r.sucesso).length;
    const err=resultados.filter(r=>!r.sucesso).length;
    return (
      <div>
        <div style={{textAlign:"center",padding:"40px 24px 32px"}}>
          <CheckCircle size={52} color="#10b981" style={{marginBottom:16}}/>
          <div style={{fontWeight:800,fontSize:20,color:COLORS.ink,marginBottom:8}}>Importação concluída!</div>
          <div style={{fontSize:14,color:COLORS.inkMuted,marginBottom:24}}>
            <strong style={{color:"#10b981"}}>{ok} empresa{ok!==1?"s":""}</strong> cadastrada{ok!==1?"s":""} com histórico de faturamento
            {err>0&&<><br/><span style={{color:COLORS.danger}}>{err} erro{err!==1?"s":""} — veja abaixo</span></>}
          </div>
          <button onClick={onImportSuccess} style={{background:COLORS.river,border:"none",borderRadius:12,padding:"12px 28px",color:COLORS.bg,fontWeight:700,fontSize:14,cursor:"pointer"}}>
            Ver lista de empresas
          </button>
        </div>
        {err>0&&(
          <div style={{background:COLORS.danger+"10",border:`1px solid ${COLORS.danger}30`,borderRadius:12,padding:16}}>
            <div style={{fontWeight:700,color:COLORS.danger,fontSize:13,marginBottom:10}}>Empresas com erro:</div>
            {resultados.filter(r=>!r.sucesso).map((r,i)=>(
              <div key={i} style={{fontSize:12,color:COLORS.danger,marginBottom:4}}>• <strong>{r.nome}</strong>: {r.erro}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TELA: PREVIEW
  // ─────────────────────────────────────────────────────────────────────────
  const selecionadas=linhas.filter(l=>l.selecionada);
  const todasSel=linhas.length>0&&linhas.every(l=>l.selecionada);

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={()=>setFase("upload")} style={{background:COLORS.surfaceAlt,border:`1px solid ${COLORS.line}`,borderRadius:9,padding:"7px 12px",color:COLORS.inkMuted,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
          <ArrowLeft size={13}/> Voltar
        </button>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:16,color:COLORS.ink}}>
            Pré-visualização: {nomeArq}
            {modo==="pdf"&&<span style={{marginLeft:8,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:99,background:COLORS.river+"15",color:COLORS.river,border:`1px solid ${COLORS.river}30`}}>PDF PGDAS-D</span>}
          </div>
          <div style={{fontSize:12,color:COLORS.inkMuted}}>
            {linhas.length} empresa{linhas.length!==1?"s":""} encontrada{linhas.length!==1?"s":""}
            {erros.length>0&&<> · <span style={{color:COLORS.amber}}>{erros.length} erro{erros.length!==1?"s":""} ignorado{erros.length!==1?"s":""}</span></>}
            {modo==="pdf"&&<> · <span style={{color:COLORS.inkMuted}}>Annexo pode ser editado por empresa</span></>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          <button onClick={()=>exportarResultados(linhas)} disabled={selecionadas.length===0}
            style={{background:COLORS.surfaceAlt,border:`1px solid ${COLORS.line}`,borderRadius:9,padding:"8px 14px",color:COLORS.inkMuted,fontWeight:600,cursor:selecionadas.length===0?"not-allowed":"pointer",opacity:selecionadas.length===0?0.4:1,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            <Download size={13}/> Exportar
          </button>
          <button onClick={handleImportar} disabled={selecionadas.length===0}
            style={{background:COLORS.river,border:"none",borderRadius:9,padding:"8px 18px",color:COLORS.bg,fontWeight:700,cursor:selecionadas.length===0?"not-allowed":"pointer",opacity:selecionadas.length===0?0.4:1,fontSize:13}}>
            Importar {selecionadas.length} empresa{selecionadas.length!==1?"s":"" } →
          </button>
        </div>
      </div>

      {/* Erros */}
      {erros.length>0&&(
        <div style={{background:COLORS.amber+"15",border:`1px solid ${COLORS.amber}40`,borderRadius:12,padding:14,marginBottom:16}}>
          <button onClick={()=>setMostrarErros(v=>!v)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,color:COLORS.amber,fontWeight:700,fontSize:13,width:"100%",textAlign:"left"}}>
            <AlertTriangle size={15}/>{erros.length} linha{erros.length!==1?"s":""}/arquivo{erros.length!==1?"s":""} com erro
            {mostrarErros?<ChevronUp size={14} style={{marginLeft:"auto"}}/>:<ChevronDown size={14} style={{marginLeft:"auto"}}/>}
          </button>
          {mostrarErros&&<ul style={{margin:"10px 0 0 22px",padding:0,fontSize:12,color:COLORS.inkMuted,lineHeight:1.8}}>{erros.map((e,i)=><li key={i}>{e}</li>)}</ul>}
        </div>
      )}

      {/* Resumo */}
      {linhas.length>0&&<Resumo linhas={linhas}/>}

      {/* Tabela */}
      {linhas.length===0&&(
        <div style={{textAlign:"center",color:COLORS.inkMuted,padding:"40px 24px",fontSize:14}}>
          Nenhuma empresa válida encontrada. Verifique os erros e reimporte.
        </div>
      )}

      {linhas.length>0&&(
        <div style={{background:COLORS.surface,borderRadius:16,border:`1px solid ${COLORS.line}`,overflow:"hidden"}}>
          {/* Cabeçalho */}
          <div style={{display:"grid",gridTemplateColumns:"36px 1fr 90px 110px 90px 80px 28px",
            padding:"10px 16px",background:COLORS.surfaceAlt,borderBottom:`1px solid ${COLORS.line}`,alignItems:"center"}}>
            <input type="checkbox" checked={todasSel} onChange={toggleAll}
              style={{width:15,height:15,cursor:"pointer",accentColor:COLORS.river}}/>
            {["Empresa / Período","RBT12","DAS Médio/mês","Eco./ano 2027","2027",""].map((h,i)=>(
              <span key={i} style={{fontSize:10,fontWeight:700,color:COLORS.inkMuted,textTransform:"uppercase",
                letterSpacing:0.4,textAlign:i===0||i===4||i===5?"left":"right"}}>{h}</span>
            ))}
          </div>

          {linhas.map((l,i)=>{
            const expanded=expandidos.has(i);
            const comp=l.comp2027;
            return (
              <div key={i} style={{borderBottom:i<linhas.length-1?`1px solid ${COLORS.line}`:"none"}}>
                {/* Linha principal */}
                <div style={{display:"grid",gridTemplateColumns:"36px 1fr 90px 110px 90px 80px 28px",
                  padding:"12px 16px",alignItems:"center",
                  background:expanded?COLORS.surfaceAlt+"80":"transparent",transition:"background 0.1s"}}>
                  <input type="checkbox" checked={l.selecionada} onChange={()=>toggleSelect(i)}
                    onClick={e=>e.stopPropagation()} style={{width:15,height:15,cursor:"pointer",accentColor:COLORS.river}}/>

                  {/* Info */}
                  <div style={{cursor:"pointer"}} onClick={()=>toggleExpand(i)}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:13,color:COLORS.ink}}>{l.nome}</span>
                      {/* Anexo: editável no modo PDF */}
                      {modo==="pdf"?(
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <select
                            value={l.anexoEfetivo}
                            onChange={e=>{e.stopPropagation();setAnexo(i,e.target.value);}}
                            onClick={e=>e.stopPropagation()}
                            style={{fontSize:10,fontWeight:700,padding:"1px 4px",borderRadius:6,
                              border:`1px solid ${l.confiancaAnexo?COLORS.river+"40":COLORS.amber+"60"}`,
                              background:l.confiancaAnexo?COLORS.river+"12":COLORS.amber+"12",
                              color:l.confiancaAnexo?COLORS.river:COLORS.amber,cursor:"pointer"}}
                          >
                            {ANEXOS_VALIDOS.map(a=><option key={a} value={a}>Anexo {a}</option>)}
                          </select>
                          {!l.confiancaAnexo&&<span style={{fontSize:9,color:COLORS.amber}}>⚠ inferido</span>}
                        </div>
                      ):(
                        <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:99,
                          background:COLORS.river+"15",color:COLORS.river,border:`1px solid ${COLORS.river}30`}}>
                          Anexo {l.anexoEfetivo}{l.usouFatorR?" (FatR)":""}
                        </span>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {l.cnpj&&<span style={{fontSize:10,color:COLORS.inkMuted,fontFamily:"monospace"}}>
                        {l.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5")}
                      </span>}
                      <span style={{fontSize:10,color:COLORS.inkMuted}}>
                        {mesLabel(l.inicio)}–{mesLabel(addMeses(l.inicio,l.meses.length-1))} · {l.mesesValidos} {modo==="pdf"?"PDF(s)":"meses"}
                      </span>
                      {modo==="pdf"&&l.rbt12Pgdas>0&&l.mesesValidos<12&&(
                        <span style={{fontSize:9,color:COLORS.river,background:COLORS.river+"10",padding:"1px 5px",borderRadius:4}}>
                          RBT12 do PGDAS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* RBT12 */}
                  <div style={{textAlign:"right",fontSize:12,color:COLORS.inkMuted,fontFamily:"monospace",cursor:"pointer"}} onClick={()=>toggleExpand(i)}>
                    {formatBRL(l.rbt12)}
                  </div>

                  {/* DAS médio */}
                  <div style={{textAlign:"right",fontSize:12,fontWeight:600,color:COLORS.river,fontFamily:"monospace",cursor:"pointer"}} onClick={()=>toggleExpand(i)}>
                    {comp&&!comp.erro?formatBRL(comp.das_mensal):"—"}
                  </div>

                  {/* Economia */}
                  <div style={{textAlign:"right",cursor:"pointer"}} onClick={()=>toggleExpand(i)}>
                    {comp&&!comp.erro?(
                      <span style={{fontSize:12,fontWeight:700,color:comp.diferenca_anual>0?"#10b981":"#6366f1",fontFamily:"monospace"}}>
                        {comp.diferenca_anual>0?"+":""}{formatBRL(comp.diferenca_anual)}
                      </span>
                    ):<span style={{fontSize:11,color:COLORS.inkMuted}}>—</span>}
                  </div>

                  {/* Badge */}
                  <div style={{cursor:"pointer"}} onClick={()=>toggleExpand(i)}>
                    {comp&&!comp.erro?<RecBadge rec={comp.recomendacao}/>:
                     comp?.erro?<span style={{fontSize:10,color:COLORS.danger}}>Erro</span>:
                     <span style={{fontSize:11,color:COLORS.inkMuted}}>—</span>}
                  </div>

                  <div style={{cursor:"pointer",display:"flex",justifyContent:"center"}} onClick={()=>toggleExpand(i)}>
                    {expanded?<ChevronUp size={14} color={COLORS.inkMuted}/>:<ChevronDown size={14} color={COLORS.inkMuted}/>}
                  </div>
                </div>

                {/* Detalhe expandido */}
                {expanded&&(
                  <div style={{padding:"0 16px 20px 52px",background:COLORS.surfaceAlt+"60"}}>

                    {/* Dados da API Receita Federal */}
                    {modo==="pdf"&&l.apiData&&(()=>{
                      const api=l.apiData;
                      const est=api.estabelecimento;
                      const situacao=est?.situacao_cadastral;
                      const ativa=situacao?.toLowerCase()==="ativa"||situacao?.toLowerCase()==="active";
                      const endereco=[est?.tipo_logradouro,est?.logradouro,est?.numero,est?.complemento].filter(Boolean).join(", ");
                      const cidadeUF=[est?.cidade?.nome,est?.estado?.sigla].filter(Boolean).join(" / ");
                      const cnaeSecundarias=est?.atividades_secundarias||[];
                      return (
                        <div style={{background:COLORS.river+"08",border:`1px solid ${COLORS.river}25`,borderRadius:10,padding:"12px 14px",marginTop:12,marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                            <span style={{fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:0.5,color:COLORS.river}}>Receita Federal</span>
                            {situacao&&<span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:99,
                              background:ativa?"#10b98120":"#ef444420",color:ativa?"#10b981":"#ef4444",
                              border:`1px solid ${ativa?"#10b98140":"#ef444440"}`}}>{situacao}</span>}
                            {l.nomePdf&&l.nomePdf!==api.razao_social&&(
                              <span style={{fontSize:10,color:COLORS.inkMuted}}>Nome no PDF: {l.nomePdf}</span>
                            )}
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px",fontSize:11}}>
                            {api.razao_social&&<div><span style={{color:COLORS.inkMuted}}>Razão Social: </span><strong style={{color:COLORS.ink}}>{api.razao_social}</strong></div>}
                            {est?.nome_fantasia&&<div><span style={{color:COLORS.inkMuted}}>Fantasia: </span><strong style={{color:COLORS.ink}}>{est.nome_fantasia}</strong></div>}
                            {est?.cnae_fiscal_principal&&<div><span style={{color:COLORS.inkMuted}}>CNAE principal: </span><strong style={{color:COLORS.ink}}>{est.cnae_fiscal_principal.codigo} — {est.cnae_fiscal_principal.descricao}</strong></div>}
                            {api.porte?.descricao&&<div><span style={{color:COLORS.inkMuted}}>Porte: </span><span style={{color:COLORS.ink}}>{api.porte.descricao}</span></div>}
                            {est?.data_inicio_atividade&&<div><span style={{color:COLORS.inkMuted}}>Início de atividade: </span><span style={{color:COLORS.ink}}>{est.data_inicio_atividade}</span></div>}
                            {api.natureza_juridica?.descricao&&<div><span style={{color:COLORS.inkMuted}}>Natureza: </span><span style={{color:COLORS.ink}}>{api.natureza_juridica.descricao}</span></div>}
                            {endereco&&<div style={{gridColumn:"1/-1"}}><span style={{color:COLORS.inkMuted}}>Endereço: </span><span style={{color:COLORS.ink}}>{endereco}{cidadeUF?` — ${cidadeUF}`:""}</span></div>}
                            {api.simples?.simples==="Sim"&&<div style={{gridColumn:"1/-1"}}><span style={{color:COLORS.inkMuted}}>Simples Nacional: </span><strong style={{color:"#10b981"}}>Optante</strong>{api.simples.data_opcao?` desde ${api.simples.data_opcao}`:""}</div>}
                          </div>
                          {cnaeSecundarias.length>0&&(
                            <div style={{marginTop:8,fontSize:10,color:COLORS.inkMuted}}>
                              CNAEs secundários: {cnaeSecundarias.slice(0,3).map(a=>`${a.codigo}`).join(", ")}{cnaeSecundarias.length>3?` + ${cnaeSecundarias.length-3} mais`:""}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Dados PGDAS extras */}
                    {modo==="pdf"&&(l.rbt12Pgdas>0||l.dasPgdas>0)&&(
                      <div style={{display:"flex",gap:16,flexWrap:"wrap",padding:"8px 0 8px",borderBottom:`1px solid ${COLORS.line}`,marginBottom:12}}>
                        <div style={{fontSize:11,color:COLORS.inkMuted}}>
                          <span style={{fontWeight:700,color:COLORS.ink}}>Dados do PGDAS: </span>
                          {l.rbt12Pgdas>0&&<>RBT12: <strong>{formatBRL(l.rbt12Pgdas)}</strong> · </>}
                          {l.dasPgdas>0&&<>DAS declarado: <strong>{formatBRL(l.dasPgdas)}</strong> · </>}
                          {l.aliqPgdas>0&&<>Alíq. efetiva: <strong>{fmtPct(l.aliqPgdas)}</strong></>}
                          {l.arquivos.length>0&&<><br/>Arquivos: {l.arquivos.join(", ")}</>}
                        </div>
                      </div>
                    )}
                    <div style={{fontSize:12,fontWeight:700,color:COLORS.inkMuted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8,paddingTop:4}}>
                      Histórico de Faturamento + DAS calculado {modo==="pdf"?"vs DAS do PGDAS":"(verificação)"}
                    </div>
                    <TabelaMeses calcMeses={l.calcMeses} mostrarPgdas={modo==="pdf"&&l.dasPgdas>0}/>
                    <div style={{marginTop:16}}>
                      <div style={{fontSize:12,fontWeight:700,color:COLORS.inkMuted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                        Comparativo Híbrido × Unificado — Projeção 2027
                      </div>
                      <Card2027 comp={comp}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"flex",gap:8,alignItems:"flex-start",marginTop:20,padding:"12px 16px",background:COLORS.surfaceAlt,borderRadius:12,border:`1px solid ${COLORS.line}`}}>
        <Info size={14} color={COLORS.inkMuted} style={{flexShrink:0,marginTop:2}}/>
        <div style={{fontSize:11,color:COLORS.inkMuted,lineHeight:1.6}}>
          Ao importar, cada empresa é cadastrada no sistema com o histórico de faturamento mensal, atividade (CNAE) e folha de salários.
          {modo==="pdf"&&" O RBT12 do PGDAS é usado diretamente quando há menos de 12 meses importados — preserva a informação oficial sem necessidade dos meses anteriores."}
          {" "}Percentuais IBS/CBS no DAS são estimativas placeholder (Res. CGSN 190/2026 — aguardar publicação dos Anexos oficiais).
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}
