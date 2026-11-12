import { calcSimples } from "../../simplesNacional/utils/calcSimples.js";
import {
  calcCreditoIBSCBS,
  calcDasHibrido,
  calcDebitoIBSCBS,
  verificarSublimiteIBS,
} from "../../simplesNacional/utils/calcHibrido.js";
import { PCT_IBS_CBS_DAS_PADRAO, getIVADualCompetencia } from "../../simplesNacional/constants/parametrosReforma.js";

const SHARE_FIELDS = ["mixZero", "mix60", "mix40", "mix30"];

function number(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

// Campo em % vindo do formulário; vazio = null (usa a referência do ano).
function rateOverride(input) {
  return input == null || String(input).trim() === "" ? null : Math.min(100, number(input)) / 100;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcComparativoSimplesHibrido(scenario, year = 2027) {
  const revenue = number(scenario.receitaMensal);
  if (revenue <= 0) return null;

  const rbt12 = number(scenario.rbt12) || revenue * 12;
  const payroll12 = number(scenario.folha12);
  const simples = calcSimples({
    rbt12,
    faturamentoMes: revenue,
    annexKey: scenario.anexo,
    folha12: payroll12,
  });
  if (!simples.tributos) return null;

  const revenueShares = Object.fromEntries(SHARE_FIELDS.map(key => [key, number(scenario[key])]));
  const shareTotal = Object.values(revenueShares).reduce((sum, value) => sum + value, 0);
  if (shareTotal > 100) {
    return { valid: false, shareTotal, error: "A soma do mix de vendas não pode ultrapassar 100%." };
  }

  const supplierShares = {
    regular: number(scenario.comprasFornecedorRegular),
    unificado: number(scenario.comprasFornecedorSimples),
  };
  const supplierShareTotal = supplierShares.regular + supplierShares.unificado;
  if (supplierShareTotal > 100) {
    return { valid: false, shareTotal, supplierShareTotal, error: "A soma do mix de fornecedores não pode ultrapassar 100%." };
  }

  const resolvedAnnex = simples.faixa.anexo;
  const annexComposition = PCT_IBS_CBS_DAS_PADRAO[resolvedAnnex];
  if (!annexComposition) {
    return { valid: false, shareTotal, error: `Não há parâmetros de composição do DAS para o Anexo ${resolvedAnnex}.` };
  }

  const isFixedIss = Boolean(scenario.issFixo) && resolvedAnnex === "III";
  const issInDas = isFixedIss ? number(simples.tributos.ISS) : 0;
  const dasBeforeHybrid = Math.max(0, simples.simplesAPagar - issInDas);
  const fixedIss = isFixedIss
    ? number(scenario.issFixoProfissionais) * number(scenario.issFixoPorProfissional)
    : 0;
  const extraEmployerCharges = number(scenario.encargosForaDAS);

  const normalMonthly = dasBeforeHybrid + fixedIss + extraEmployerCharges;
  const { dasReduzido, valorIbsRemovido, valorCbsRemovido } = calcDasHibrido(
    dasBeforeHybrid,
    annexComposition.pct_ibs,
    annexComposition.pct_cbs
  );

  const competence = `${year}-01`;
  const cbsRateOverride = rateOverride(scenario.aliqCbsReferencia);
  const ibsRateOverride = rateOverride(scenario.aliqIbsReferencia);
  const dualRate = calcDebitoIBSCBS(revenue, competence, cbsRateOverride, ibsRateOverride);
  const reductionWeight = 1
    - revenueShares.mixZero / 100
    - revenueShares.mix60 / 100 * 0.6
    - revenueShares.mix40 / 100 * 0.4
    - revenueShares.mix30 / 100 * 0.3;
  const debitIbs = dualRate.debito_ibs * reductionWeight;
  const debitCbs = dualRate.debito_cbs * reductionWeight;

  const totalPurchases = number(scenario.comprasMensais);
  const purchasesRegular = totalPurchases * supplierShares.regular / 100;
  const purchasesUnificado = totalPurchases * supplierShares.unificado / 100;
  const creditRegular = calcCreditoIBSCBS(purchasesRegular, "regular", competence, 0, cbsRateOverride, ibsRateOverride);
  const creditUnificado = calcCreditoIBSCBS(
    purchasesUnificado,
    "unificado",
    competence,
    annexComposition.pct_ibs + annexComposition.pct_cbs,
    cbsRateOverride,
    ibsRateOverride
  );

  const creditIbs = creditRegular.credito_ibs + creditUnificado.credito_ibs;
  const creditCbs = creditRegular.credito_cbs + creditUnificado.credito_cbs;
  const ibsDue = Math.max(0, debitIbs - creditIbs);
  const cbsDue = Math.max(0, debitCbs - creditCbs);
  const complianceCost = number(scenario.custoConformidadeMensal);
  const hybridMonthly = dasReduzido + ibsDue + cbsDue + fixedIss + extraEmployerCharges + complianceCost;

  const b2bShare = Math.min(100, number(scenario.clientesB2B)) / 100;
  const normalCreditToCustomers = revenue * b2bShare
    * simples.taxaEfetiva / 100
    * (annexComposition.pct_ibs + annexComposition.pct_cbs);
  const hybridCreditToCustomers = (debitIbs + debitCbs) * b2bShare;

  return {
    valid: true,
    year,
    revenue,
    rbt12,
    payroll12,
    annex: resolvedAnnex,
    sublimiteIBS: verificarSublimiteIBS(rbt12),
    fatorR: simples.fatorR,
    usedFatorR: simples.usouFatorR,
    mixTotal: shareTotal,
    supplierShareTotal,
    reductionWeight,
    dualRate,
    cbsRateOverride: dualRate.aliq_cbs,
    ibsRateOverride: dualRate.aliq_ibs,
    normalMonthly: round(normalMonthly),
    hybridMonthly: round(hybridMonthly),
    normalAnnual: round(normalMonthly * 12),
    hybridAnnual: round(hybridMonthly * 12),
    dasFull: round(simples.simplesAPagar),
    dasNormal: round(dasBeforeHybrid),
    dasReduced: round(dasReduzido),
    removedIbsFromDas: round(valorIbsRemovido),
    removedCbsFromDas: round(valorCbsRemovido),
    ibsDue: round(ibsDue),
    cbsDue: round(cbsDue),
    creditIbs: round(creditIbs),
    creditCbs: round(creditCbs),
    fixedIss: round(fixedIss),
    extraEmployerCharges: round(extraEmployerCharges),
    complianceCost: round(complianceCost),
    normalCreditToCustomers: round(normalCreditToCustomers * 12),
    hybridCreditToCustomers: round(hybridCreditToCustomers * 12),
    supplierNonCreditableShare: 100 - supplierShareTotal,
    savingsHybridAnnual: round((normalMonthly - hybridMonthly) * 12),
    ivaNote: getIVADualCompetencia(competence).nota,
  };
}
