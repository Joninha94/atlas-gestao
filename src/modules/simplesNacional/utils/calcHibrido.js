// Motor de cálculo do Regime Híbrido IBS/CBS — Simples Nacional
// Resolução CGSN nº 190/2026 · Seções 6.1–6.4 da especificação técnica
//
// ATENÇÃO: os percentuais de IBS/CBS na composição do DAS por Anexo/faixa
// são PLACEHOLDER até publicação oficial dos Anexos pelo CGSN.

import { getIVADualCompetencia, SUBLIMITE_IBS, SUBLIMITE_IBS_IMEDIATO } from "../constants/parametrosReforma.js";

// ── Seção 6.2 — DAS reduzido no modo híbrido (art. 22-A) ─────────────────────
// pctIbsDas / pctCbsDas: fração da COMPOSIÇÃO DO DAS (ex: 0.34 = 34%)
// A "parcela" removida é um VALOR MONETÁRIO (= DAS × pct), não uma subtração de alíquota.
export function calcDasHibrido(dasCompleto, pctIbsDas, pctCbsDas) {
  const valorIbsRemovido = dasCompleto * (pctIbsDas || 0);
  const valorCbsRemovido = dasCompleto * (pctCbsDas || 0);
  const dasReduzido = Math.max(0, dasCompleto - valorIbsRemovido - valorCbsRemovido);
  return { dasReduzido, valorIbsRemovido, valorCbsRemovido };
}

// ── Débito de IBS/CBS sobre as saídas (regime regular, não cumulativo) ────────
// Overrides em taxa decimal; null usa a referência do ano para aquele tributo.
export function calcDebitoIBSCBS(receita, competencia, aliquotaCbsOverride = null, aliquotaIbsOverride = null) {
  const iva = getIVADualCompetencia(competencia);
  const aliq_cbs = aliquotaCbsOverride ?? iva.aliq_cbs;
  const aliq_ibs = aliquotaIbsOverride ?? iva.aliq_ibs;
  return {
    debito_ibs: receita * aliq_ibs,
    debito_cbs: receita * aliq_cbs,
    aliq_ibs,
    aliq_cbs,
    nota:        iva.nota,
  };
}

// ── Fator de crédito conforme regime do fornecedor (Seção 6.3 / RN12) ─────────
// fatorUnificado: percentual_ibs + percentual_cbs da faixa do FORNECEDOR (se unificado)
export function getFatorCredito(regimeFornecedor, fatorUnificado = 0) {
  switch (regimeFornecedor) {
    case "regular":
    case "hibrido":
      return 1.0;
    case "unificado":
      return fatorUnificado;
    case "mei":
    case "pf":
    default:
      return 0.0;
  }
}

// ── Crédito de IBS/CBS sobre as entradas ─────────────────────────────────────
export function calcCreditoIBSCBS(compras, regimeFornecedor, competencia, fatorUnificado = 0, aliquotaCbsOverride = null, aliquotaIbsOverride = null) {
  const iva    = getIVADualCompetencia(competencia);
  const fator  = getFatorCredito(regimeFornecedor, fatorUnificado);
  return {
    credito_ibs: compras * (aliquotaIbsOverride ?? iva.aliq_ibs) * fator,
    credito_cbs: compras * (aliquotaCbsOverride ?? iva.aliq_cbs) * fator,
    fator,
  };
}

// ── Comparativo completo para um mês ─────────────────────────────────────────
// Retorna custo_unificado, custo_hibrido e decomposição de ambos.
export function comparativoMes({
  dasCompleto,
  pctIbsDas,
  pctCbsDas,
  receita,
  compras,
  regimeFornecedor,           // "regular" | "hibrido" | "unificado" | "mei" | "pf"
  fatorCreditoUnificado,      // se regime=unificado: pctIBS+pctCBS do fornecedor
  custoConformidadeExtra,     // custo extra mensal de conformidade (contabilidade, EFD)
  competencia,                // "AAAA-MM"
  aliquotaCbsOverride = null, // taxa decimal; null usa referência do ano
  aliquotaIbsOverride = null, // idem, para o IBS
}) {
  // Unificado — é apenas o DAS completo
  const custo_unificado = dasCompleto;

  // Híbrido — DAS reduzido + IBS/CBS apurados separadamente
  const { dasReduzido, valorIbsRemovido, valorCbsRemovido } = calcDasHibrido(dasCompleto, pctIbsDas, pctCbsDas);
  const { debito_ibs, debito_cbs, aliq_ibs, aliq_cbs, nota } = calcDebitoIBSCBS(receita, competencia, aliquotaCbsOverride, aliquotaIbsOverride);
  const { credito_ibs, credito_cbs, fator } = calcCreditoIBSCBS(compras, regimeFornecedor, competencia, fatorCreditoUnificado, aliquotaCbsOverride, aliquotaIbsOverride);

  const ibs_devido = Math.max(0, debito_ibs - credito_ibs);
  const cbs_devido = Math.max(0, debito_cbs - credito_cbs);
  const extra = custoConformidadeExtra || 0;
  const custo_hibrido = dasReduzido + ibs_devido + cbs_devido + extra;

  return {
    custo_unificado,
    dasCompleto,
    custo_hibrido,
    dasReduzido,
    valorIbsRemovido,
    valorCbsRemovido,
    ibs_devido,
    cbs_devido,
    debito_ibs,
    debito_cbs,
    credito_ibs,
    credito_cbs,
    custoConformidadeExtra: extra,
    fatorCredito: fator,
    diferenca: custo_unificado - custo_hibrido, // positivo = híbrido mais barato
    aliq_ibs,
    aliq_cbs,
    notaIVA: nota,
  };
}

// ── Seção 6.4 — Sublimite IBS (Res. 190/2026) ─────────────────────────────────
export function verificarSublimiteIBS(rbt12) {
  if (rbt12 > SUBLIMITE_IBS_IMEDIATO) {
    return { atingido: true, nivel: "imediato", efeito: "mês seguinte", limite: SUBLIMITE_IBS_IMEDIATO };
  }
  if (rbt12 > SUBLIMITE_IBS) {
    return { atingido: true, nivel: "gradual", efeito: "1º dia do ano-calendário seguinte", limite: SUBLIMITE_IBS };
  }
  return { atingido: false, nivel: null, efeito: null, limite: SUBLIMITE_IBS };
}

// ── Seção 7.3 — Índice de competitividade B2B ─────────────────────────────────
// Mede o ganho comercial estimado ao oferecer crédito pleno a clientes PJ.
export function calcIndiceCompetitividadeB2B({
  aliqEfetivaTotal,   // alíquota efetiva total do DAS (decimal, ex: 0.04)
  pctIbsDas,
  pctCbsDas,
  competencia,
  pctReceitaB2B,      // 0–1
  receitaAnual,
  aliquotaCbsOverride = null,
  aliquotaIbsOverride = null,
}) {
  const iva = getIVADualCompetencia(competencia);

  // Alíquota IBS+CBS embutida SOBRE A RECEITA (converte fracção do DAS → fracção da receita)
  const aliq_ibs_cbs_receita = aliqEfetivaTotal * ((pctIbsDas || 0) + (pctCbsDas || 0));

  // Alíquota cheia do IVA Dual (também sobre a receita)
  const aliq_cheia = (aliquotaIbsOverride ?? iva.aliq_ibs) + (aliquotaCbsOverride ?? iva.aliq_cbs);

  // Crédito marginal: diferença entre crédito pleno (híbrido) e crédito embutido (unificado)
  const credito_marginal = Math.max(0, aliq_cheia - aliq_ibs_cbs_receita);

  const receita_b2b = (receitaAnual || 0) * (pctReceitaB2B || 0);
  const ganho_estimado = receita_b2b * credito_marginal;

  let interpretacao;
  if ((pctReceitaB2B || 0) >= 0.5)     interpretacao = "alto";
  else if ((pctReceitaB2B || 0) >= 0.2) interpretacao = "medio";
  else                                   interpretacao = "baixo";

  return {
    credito_marginal,          // ex: 0.082 = 8,2 p.p. a mais de crédito para o comprador
    aliq_ibs_cbs_receita,
    aliq_cheia,
    ganho_estimado,
    interpretacao,
    receita_b2b,
  };
}

// ── Seção 7.4 — Recomendação ─────────────────────────────────────────────────
export function gerarRecomendacao(diferencaCaixa, indice, pctReceitaB2B) {
  if (diferencaCaixa > 0 && indice.interpretacao !== "baixo") return "HIBRIDO";
  if (diferencaCaixa > 0 && indice.interpretacao === "baixo") return "HIBRIDO";
  if (diferencaCaixa <= 0 && indice.interpretacao === "alto")  return "AVALIAR";
  return "UNIFICADO";
}
