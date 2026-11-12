// Parâmetros da Reforma Tributária para o Simples Nacional
// Base legal: Resolução CGSN nº 190/2026 (DOU Extra 10/08/2026)
//             LC nº 214/2025 · EC nº 132/2023
//
// ATENÇÃO: alíquotas de referência do IVA Dual e percentuais de IBS/CBS no DAS
// são ESTIMATIVAS baseadas em fontes secundárias. Validar contra o texto oficial
// do DOU e Anexos do CGSN antes de usar em produção para clientes reais.

// ── Sublimites (Res. 190/2026 — IBS agora também segue o sublimite) ──────────
export const SUBLIMITE_IBS           = 3_600_000; // R$ 3,6M → efeito no ano-calendário seguinte
export const SUBLIMITE_IBS_IMEDIATO  = 4_320_000; // R$ 4,32M (120% do sublimite) → efeito no mês seguinte

// ── Alíquotas de referência do IVA Dual por ano ──────────────────────────────
// Baseadas na LC 214/2025 e cronograma de transição da EC 132/2023
// Campo `de` = competência de início da vigência ("AAAA-MM")
// CBS substitui PIS/COFINS a partir de 2027; IBS substitui ICMS/ISS gradualmente até 2033.
export const IVA_DUAL_REFERENCIA = [
  { de: "2026-01", aliq_ibs: 0.001, aliq_cbs: 0.009, nota: "Fase de teste — compensação com PIS/COFINS" },
  { de: "2027-01", aliq_ibs: 0.001, aliq_cbs: 0.088, nota: "CBS efetiva (PIS/COFINS extintos); IBS início da rampa" },
  { de: "2028-01", aliq_ibs: 0.025, aliq_cbs: 0.088, nota: "IBS fase 1" },
  { de: "2029-01", aliq_ibs: 0.050, aliq_cbs: 0.088, nota: "IBS fase 2" },
  { de: "2030-01", aliq_ibs: 0.080, aliq_cbs: 0.088, nota: "IBS fase 3" },
  { de: "2031-01", aliq_ibs: 0.110, aliq_cbs: 0.088, nota: "IBS fase 4" },
  { de: "2032-01", aliq_ibs: 0.133, aliq_cbs: 0.088, nota: "IBS fase 5" },
  { de: "2033-01", aliq_ibs: 0.177, aliq_cbs: 0.088, nota: "Sistema pleno (ICMS/ISS extintos)" },
];

// ── Percentuais padrão de IBS/CBS na composição do DAS por Anexo ─────────────
// PLACEHOLDER — substituir pelos Anexos oficiais quando publicados pelo CGSN.
// Escala: fração do DAS total (mesma escala de %IRPJ, %CSLL, %CPP da tabela de repartição).
// Metodologia: CBS ≈ PIS+COFINS do DAS atual; IBS ≈ ICMS ou ISS do DAS atual.
export const PCT_IBS_CBS_DAS_PADRAO = {
  I:   { pct_ibs: 0.340, pct_cbs: 0.155 }, // Comércio:    ICMS 34% → IBS; PIS+COFINS 15.5% → CBS
  II:  { pct_ibs: 0.320, pct_cbs: 0.140 }, // Indústria:   ICMS 32%      ; PIS+COFINS 14.0%
  III: { pct_ibs: 0.335, pct_cbs: 0.156 }, // Serv. (6%):  ISS 33.5%    ; PIS+COFINS 15.6%
  IV:  { pct_ibs: 0.400, pct_cbs: 0.215 }, // Serv. (4.5%):ISS ~40%     ; PIS+COFINS ~21.5%
  V:   { pct_ibs: 0.140, pct_cbs: 0.172 }, // Serv. (15.5%):ISS 14%     ; PIS+COFINS 17.2%
};

// ── Calendário de janelas de opção / cancelamento (Art. 40-D) ────────────────
// abre_mm_dd / fecha_mm_dd: mês-dia de abertura e fechamento da janela
export const JANELAS_OPCAO = [
  {
    id: "jan",
    descricao: "Semestre Janeiro — opção válida para 01/01 do ano seguinte",
    abre_mm_dd: "09-01",
    fecha_mm_dd: "09-30",
    mes_efeito: "01",
    efeito_desc: "01/01 do ano seguinte",
  },
  {
    id: "jul",
    descricao: "Semestre Julho — opção válida para 01/07 do mesmo ano",
    abre_mm_dd: "03-01",
    fecha_mm_dd: "03-31",
    mes_efeito: "07",
    efeito_desc: "01/07 do mesmo ano",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Retorna alíquotas IVA Dual vigentes para uma competência "AAAA-MM" ou "AAAA"
export function getIVADualCompetencia(competencia) {
  const chave = String(competencia).slice(0, 7); // "AAAA-MM"
  const candidatas = IVA_DUAL_REFERENCIA.filter(r => r.de <= chave);
  if (candidatas.length === 0) return IVA_DUAL_REFERENCIA[0];
  return candidatas[candidatas.length - 1];
}

// Retorna o estado atual da janela de opção dado um objeto Date (ou today)
export function getStatusJanelaOpcao(data = new Date()) {
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  const mmdd = `${mm}-${dd}`;
  const ano = data.getFullYear();

  // Verifica se está dentro de alguma janela
  for (const j of JANELAS_OPCAO) {
    if (mmdd >= j.abre_mm_dd && mmdd <= j.fecha_mm_dd) {
      return {
        aberta: true,
        janela: j,
        fechamento: `${ano}-${j.fecha_mm_dd}`,
        efeito: j.efeito_desc.replace("ano seguinte", String(ano + 1)).replace("mesmo ano", String(ano)),
      };
    }
  }

  // Próximas duas janelas
  const proximas = JANELAS_OPCAO.flatMap(j => {
    const abertura_este_ano  = `${ano}-${j.abre_mm_dd}`;
    const abertura_prox_ano  = `${ano + 1}-${j.abre_mm_dd}`;
    const abertura = mmdd > j.fecha_mm_dd ? abertura_prox_ano : abertura_este_ano;
    const anoEfeito = abertura.slice(0, 4);
    return [{
      janela: j,
      abertura,
      fechamento: abertura.replace(j.abre_mm_dd, j.fecha_mm_dd),
      efeito: j.efeito_desc
        .replace("ano seguinte", String(parseInt(anoEfeito) + (j.id === "jan" ? 1 : 0)))
        .replace("mesmo ano", anoEfeito),
    }];
  }).sort((a, b) => a.abertura.localeCompare(b.abertura)).slice(0, 2);

  return { aberta: false, proximas };
}
