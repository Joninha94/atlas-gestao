import { useMemo } from "react";
import { COLORS } from "../../../constants/colors.js";
import { formatBRL } from "../../../utils/format.js";
import { MoneyInput } from "../../../components/ui/MoneyInput.jsx";
import { calcPresumido } from "../utils/calcPresumido.js";
import { cnaeAnnexToAtividade } from "../utils/cnaeUtils.js";
import { PRESUNCAO, IRPJ_ADICIONAL_LIMITE_TRIM } from "../constants/parametros2026.js";

const C = COLORS;

const inp = {
  background: C.surfaceAlt, border: `1px solid ${C.line}`,
  borderRadius: 8, color: C.ink, padding: "8px 12px",
  fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none",
};

function Lbl({ children }) {
  return <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 4 }}>{children}</div>;
}

function ResultRow({ label, value, bold, muted, sub }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "6px 0", borderBottom: `1px solid ${C.line}`,
      fontSize: bold ? 14 : 13,
    }}>
      <span style={{ color: sub ? C.inkMuted : C.ink, paddingLeft: sub ? 12 : 0, fontSize: sub ? 12 : undefined }}>
        {label}
      </span>
      <span style={{ fontWeight: bold ? 700 : 400, color: muted ? C.inkMuted : bold ? C.river : C.ink }}>
        {typeof value === "number" ? formatBRL(value) : value}
      </span>
    </div>
  );
}

function trimLabel(trim, ano) {
  const meses = { T1: "Jan–Mar", T2: "Abr–Jun", T3: "Jul–Set", T4: "Out–Dez" };
  return `${trim}/${ano} (${meses[trim]})`;
}

function vencimento(trim, ano) {
  const mes = { T1: "30/abr", T2: "31/jul", T3: "31/out", T4: "31/jan" };
  const anoVenc = trim === "T4" ? ano + 1 : ano;
  return `${mes[trim]}/${anoVenc}`;
}

const ATIVIDAES_DROPDOWN = Object.entries(PRESUNCAO).map(([k, v]) => ({ key: k, label: v.label }));

export function PresumidoView({ empresa = {}, onChange = () => {} }) {
  const now = new Date();
  const trimAtual = `T${Math.ceil((now.getMonth() + 1) / 3)}`;
  const config = empresa.presumido || {};

  // Seed from empresa when CNAE / receita changes
  const defaults = useMemo(() => {
    const receitaAnual = parseFloat(empresa.receitaAnual) || 0;
    const recTrim = String(receitaAnual / 4);
    if (empresa.cnaeAnnex) {
      const atv = cnaeAnnexToAtividade(empresa.cnaeAnnex);
      if (atv.isComercio) {
        return {
          receitaComercio: recTrim, receitaServicos: "",
          atividadeComercio: atv.atividadeComercio ?? "comercio",
        };
      } else {
        return {
          receitaComercio: "", receitaServicos: recTrim,
          atividadeServicos: atv.atividadeServicos ?? "servicos_profissionais",
        };
      }
    }
    return { receitaComercio: "", receitaServicos: recTrim };
  }, [empresa.receitaAnual, empresa.cnaeAnnex]);

  const trim = config.trimestre || trimAtual;
  const ano = config.ano || now.getFullYear();
  const recComStr = config.receitaComercio ?? defaults.receitaComercio;
  const recSvcStr = config.receitaServicos ?? defaults.receitaServicos;
  const recFinStr = config.receitaFinanceira ?? "";
  const recCapStr = config.ganhoCapital ?? "";
  const atvCom = config.atividadeComercio || defaults.atividadeComercio || "comercio";
  const atvSvc = config.atividadeServicos || defaults.atividadeServicos || "servicos_profissionais";
  function setConfig(field, value) {
    onChange({ presumido: { ...config, [field]: value } });
  }

  const recCom = parseFloat(recComStr) || 0;
  const recSvc = parseFloat(recSvcStr) || 0;
  const recFin = parseFloat(recFinStr) || 0;
  const recCap = parseFloat(recCapStr) || 0;
  // Mesmos campos de "Dados da empresa" (também usados no Simulador e na Projeção)
  const icmsStr = empresa.icmsEfetivo ?? "";
  const issStr  = empresa.issEfetivo ?? "";
  const aliqIcms = parseFloat(icmsStr) || 0;
  const aliqIss  = parseFloat(issStr) || 0;

  const res = useMemo(() => {
    if (recCom + recSvc + recFin + recCap <= 0) return null;
    return calcPresumido({
      receitaComercio: recCom, receitaServicos: recSvc,
      receitaFinanceira: recFin, ganhoCapital: recCap,
      atividadeComercio: atvCom, atividadeServicos: atvSvc,
      aliqIcms, aliqIss,
    });
  }, [recCom, recSvc, recFin, recCap, atvCom, atvSvc, aliqIcms, aliqIss]);

  const pCom = PRESUNCAO[atvCom];
  const pSvc = PRESUNCAO[atvSvc];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Período */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 16 }}>Período de apuração</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 100 }}>
            <Lbl>Trimestre</Lbl>
            <select value={trim} onChange={e => setConfig("trimestre", e.target.value)} style={{ ...inp, cursor: "pointer", width: "auto" }}>
              {["T1", "T2", "T3", "T4"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 90 }}>
            <Lbl>Ano</Lbl>
            <input type="number" value={ano} min={2020} max={2030}
              onChange={e => setConfig("ano", Number(e.target.value))} style={{ ...inp, width: 90 }} />
          </div>
          <div style={{ fontSize: 13, color: C.inkMuted, paddingBottom: 10 }}>
            Período: <strong style={{ color: C.ink }}>{trimLabel(trim, ano)}</strong>
            &ensp;|&ensp;Vencimento DARF: <strong style={{ color: C.copper }}>{vencimento(trim, ano)}</strong>
          </div>
        </div>
      </div>

      {/* Receitas */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Receitas do trimestre</div>
          {empresa.receitaAnual && (
            <div style={{ fontSize: 11, color: C.inkMuted }}>
              Pré-preenchido com receita anual ÷ 4 (ajuste se necessário)
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <Lbl>Receita de Comércio / Indústria</Lbl>
            <MoneyInput value={recComStr} onChange={value => setConfig("receitaComercio", value)} style={inp} placeholder="0,00" />
          </div>
          <div>
            <Lbl>Tipo de atividade (comércio/indústria)</Lbl>
            <select value={atvCom} onChange={e => setConfig("atividadeComercio", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {ATIVIDAES_DROPDOWN.filter(a => ["comercio", "industria", "transp_cargas", "combustiveis"].includes(a.key))
                .map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
              Presunção IRPJ {pCom.irpj}% · CSLL {pCom.csll}%
            </div>
          </div>

          <div>
            <Lbl>Receita de Serviços</Lbl>
            <MoneyInput value={recSvcStr} onChange={value => setConfig("receitaServicos", value)} style={inp} placeholder="0,00" />
          </div>
          <div>
            <Lbl>Tipo de serviço</Lbl>
            <select value={atvSvc} onChange={e => setConfig("atividadeServicos", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              {ATIVIDAES_DROPDOWN.filter(a => !["comercio", "industria", "transp_cargas", "combustiveis"].includes(a.key))
                .map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
              Presunção IRPJ {pSvc.irpj}% · CSLL {pSvc.csll}%
            </div>
          </div>

          <div>
            <Lbl>Receitas financeiras (juros, rendimentos)</Lbl>
            <MoneyInput value={recFinStr} onChange={value => setConfig("receitaFinanceira", value)} style={inp} placeholder="0,00" />
          </div>
          <div>
            <Lbl>Ganhos de capital / receitas eventuais</Lbl>
            <MoneyInput value={recCapStr} onChange={value => setConfig("ganhoCapital", value)} style={inp} placeholder="0,00" />
          </div>

          <div>
            <Lbl>ICMS efetivo % (sobre comércio/indústria)</Lbl>
            <input type="number" value={icmsStr} step="0.5" min="0" max="30" placeholder="ex: 12"
              onChange={e => onChange({ icmsEfetivo: e.target.value })} style={inp} />
          </div>
          <div>
            <Lbl>ISS % (sobre serviços)</Lbl>
            <input type="number" value={issStr} step="0.5" min="0" max="5" placeholder="2 a 5"
              onChange={e => onChange({ issEfetivo: e.target.value })} style={inp} />
            <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>Alíquota do município: mínimo 2%, máximo 5%.</div>
          </div>
        </div>
      </div>

      {/* Resultado */}
      {res ? (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>

          {/* IRPJ card */}
          <div style={{ flex: "1 1 300px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 12 }}>IRPJ</div>

            <ResultRow label="Receita de comércio/indústria" value={res.receitaComercio} muted sub />
            {res.receitaComercio > 0 && (
              <ResultRow label={`Presunção ${pCom.irpj}% → base`} value={res.baseIRPJComercio} muted sub />
            )}
            <ResultRow label="Receita de serviços" value={res.receitaServicos} muted sub />
            {res.receitaServicos > 0 && (
              <ResultRow label={`Presunção ${pSvc.irpj}% → base`} value={res.baseIRPJServicos} muted sub />
            )}
            {res.receitaFinanceira > 0 && <ResultRow label="Receitas financeiras (100%)" value={res.receitaFinanceira} muted sub />}
            {res.ganhoCapital > 0 && <ResultRow label="Ganhos de capital (100%)" value={res.ganhoCapital} muted sub />}

            <div style={{ marginTop: 4 }}>
              <ResultRow label="Base de cálculo IRPJ" value={res.baseIRPJ} />
              <ResultRow label="IRPJ 15%" value={res.irpj} />
              {res.adicional > 0 && (
                <ResultRow label={`Adicional 10% (base acima de ${formatBRL(IRPJ_ADICIONAL_LIMITE_TRIM)})`} value={res.adicional} sub />
              )}
              <ResultRow label="IRPJ Total" value={res.irpjTotal} bold />
            </div>
          </div>

          {/* CSLL + PIS/COFINS */}
          <div style={{ flex: "1 1 240px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 12 }}>CSLL · PIS · COFINS{res.icms > 0 ? " · ICMS" : ""}{res.iss > 0 ? " · ISS" : ""}</div>

            {res.receitaServicos > 0 && (
              <ResultRow label={`Base CSLL — serviços (${pSvc.csll}%)`} value={res.baseCSLLServicos} muted sub />
            )}
            {res.receitaComercio > 0 && (
              <ResultRow label={`Base CSLL — comércio (${pCom.csll}%)`} value={res.baseCSLLComercio} muted sub />
            )}
            <ResultRow label="CSLL 9%"       value={res.csll} />
            <ResultRow label="PIS 0,65%"     value={res.pis} />
            <ResultRow label="COFINS 3,00%"  value={res.cofins} />
            {res.icms > 0 && <ResultRow label={`ICMS ${String(aliqIcms).replace(".", ",")}%`} value={res.icms} />}
            {res.iss > 0 && <ResultRow label={`ISS ${String(aliqIss).replace(".", ",")}%`} value={res.iss} />}
          </div>

          {/* Total */}
          <div style={{ flex: "1 1 200px", background: C.surface, border: `2px solid ${C.copper}50`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.5, marginBottom: 12 }}>TOTAL DO TRIMESTRE</div>

            <div style={{ fontSize: 10, fontWeight: 700, color: C.copper, letterSpacing: 0.5, margin: "4px 0 2px" }}>PAGO NO TRIMESTRE</div>
            <ResultRow label="IRPJ"   value={res.irpjTotal} />
            <ResultRow label="CSLL"   value={res.csll} />
            <div style={{ fontSize: 10, fontWeight: 700, color: C.river, letterSpacing: 0.5, margin: "10px 0 2px" }}>PAGO TODO MÊS · valor do trimestre (≈ por mês)</div>
            <ResultRow label="PIS"    value={res.pis} sub />
            <ResultRow label="COFINS" value={res.cofins} sub />
            {res.icms > 0 && <ResultRow label="ICMS" value={res.icms} sub />}
            {res.iss > 0 && <ResultRow label="ISS" value={res.iss} sub />}
            <div style={{ fontSize: 11, color: C.inkMuted, textAlign: "right", marginTop: 2 }}>
              ≈ {formatBRL((res.pis + res.cofins + res.icms + res.iss) / 3)} por mês
            </div>

            <div style={{ marginTop: 12, paddingTop: 8, borderTop: `2px solid ${C.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.river }}>{formatBRL(res.total)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
                {res.aliqEfetiva.toFixed(2).replace(".", ",")}% da receita bruta
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "8px 10px", background: `${C.copper}10`, borderRadius: 8, fontSize: 11, color: C.inkMuted, lineHeight: 1.5 }}>
              <strong style={{ color: C.ink }}>Trimestral</strong> · IRPJ e CSLL vencem em <strong style={{ color: C.copper }}>{vencimento(trim, ano)}</strong> (cota única ou 3 quotas; mínimo R$ 1.000 por quota). DARF 2089 (IRPJ) · 2372 (CSLL).
              <br /><strong style={{ color: C.ink }}>Mensal</strong> · PIS e COFINS até o dia 25 do mês seguinte: DARF 8109 (PIS) · 2172 (COFINS). ICMS e ISS no prazo da UF e do município.
              <br /><strong style={{ color: C.ink }}>Anual</strong> · ECD (último dia útil de junho) e ECF (último dia útil de julho).
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.inkMuted, fontSize: 13 }}>
          Informe pelo menos uma receita do trimestre para calcular.
        </div>
      )}
    </div>
  );
}
