import {
  PRESUNCAO,
  IRPJ_ALIQUOTA, IRPJ_ADICIONAL, IRPJ_ADICIONAL_LIMITE_TRIM,
  CSLL_ALIQUOTA,
  PIS_CUMULATIVO, COFINS_CUMULATIVO,
} from "../constants/parametros2026.js";

function rnd(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula os tributos do Lucro Presumido para um trimestre.
 *
 * @param {object} p
 * @param {number} p.receitaComercio     Receita de comércio/indústria no trimestre
 * @param {number} p.receitaServicos     Receita de serviços no trimestre
 * @param {number} p.receitaFinanceira   Receitas financeiras (juros, rendimentos)
 * @param {number} p.ganhoCapital        Ganhos de capital / receitas não-operacionais
 * @param {string} p.atividadeComercio   Chave de PRESUNCAO para receita de comércio
 * @param {string} p.atividadeServicos   Chave de PRESUNCAO para receita de serviços
 * @returns {object}
 */
export function calcPresumido({
  receitaComercio   = 0,
  receitaServicos   = 0,
  receitaFinanceira = 0,
  ganhoCapital      = 0,
  atividadeComercio = "comercio",
  atividadeServicos = "servicos_gerais",
  aliqIcms          = 0, // % efetivo sobre a receita de comércio/indústria
  aliqIss           = 0, // % efetivo sobre a receita de serviços
}) {
  const pCom = PRESUNCAO[atividadeComercio] ?? PRESUNCAO.comercio;
  const pSvc = PRESUNCAO[atividadeServicos] ?? PRESUNCAO.servicos_gerais;

  const receitaBruta = receitaComercio + receitaServicos + receitaFinanceira;
  const receitaTotal = receitaBruta + ganhoCapital;

  // Bases de presunção — IRPJ (Lei 9.249/95 art. 15)
  const baseIRPJComercio = rnd(receitaComercio   * (pCom.irpj / 100));
  const baseIRPJServicos = rnd(receitaServicos   * (pSvc.irpj / 100));
  const baseIRPJ         = baseIRPJComercio + baseIRPJServicos + receitaFinanceira + ganhoCapital;

  // Bases de presunção — CSLL (Lei 9.249/95 art. 20)
  const baseCSLLComercio = rnd(receitaComercio   * (pCom.csll / 100));
  const baseCSLLServicos = rnd(receitaServicos   * (pSvc.csll / 100));
  const baseCSLL         = baseCSLLComercio + baseCSLLServicos + receitaFinanceira + ganhoCapital;

  // IRPJ: 15% + adicional de 10% sobre excedente de R$ 60.000/trimestre
  const irpj      = rnd(baseIRPJ * (IRPJ_ALIQUOTA / 100));
  const adicional = rnd(Math.max(0, baseIRPJ - IRPJ_ADICIONAL_LIMITE_TRIM) * (IRPJ_ADICIONAL / 100));
  const irpjTotal = irpj + adicional;

  // CSLL = 9%
  const csll = rnd(baseCSLL * (CSLL_ALIQUOTA / 100));

  // PIS / COFINS cumulativo sobre receita bruta total
  const pis    = rnd(receitaBruta * (PIS_CUMULATIVO    / 100));
  const cofins = rnd(receitaBruta * (COFINS_CUMULATIVO / 100));

  // ICMS e ISS: alíquota efetiva informada pelo usuário (varia por UF/município)
  const icms = rnd(receitaComercio * ((Number(aliqIcms) || 0) / 100));
  const iss  = rnd(receitaServicos * ((Number(aliqIss)  || 0) / 100));

  const total       = rnd(irpjTotal + csll + pis + cofins + icms + iss);
  const aliqEfetiva = receitaTotal > 0 ? rnd(total / receitaTotal * 100) : 0;

  return {
    receitaComercio, receitaServicos, receitaFinanceira, ganhoCapital,
    receitaBruta, receitaTotal,
    pctPresuncaoIRPJ: { comercio: pCom.irpj, servicos: pSvc.irpj },
    pctPresuncaoCSLL: { comercio: pCom.csll, servicos: pSvc.csll },
    baseIRPJComercio, baseIRPJServicos, baseIRPJ,
    baseCSLLComercio, baseCSLLServicos, baseCSLL,
    irpj, adicional, irpjTotal,
    csll, pis, cofins, icms, iss,
    total, aliqEfetiva,
  };
}
