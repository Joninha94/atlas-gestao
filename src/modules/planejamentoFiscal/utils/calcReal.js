import {
  IRPJ_ALIQUOTA, IRPJ_ADICIONAL,
  IRPJ_ADICIONAL_LIMITE_TRIM, IRPJ_ADICIONAL_LIMITE_ANUAL,
  CSLL_ALIQUOTA,
  PIS_NAO_CUMULATIVO, COFINS_NAO_CUMULATIVO,
  LIMITE_COMPENSACAO,
} from "../constants/parametros2026.js";

function rnd(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula o Lucro Real para um período (trimestral ou anual).
 *
 * @param {object} p
 * @param {number} p.lucroLiquido        Lucro líquido contábil antes do IRPJ/CSLL
 * @param {number} p.adicoes             Adições ao LALUR (multas indedutíveis, etc.)
 * @param {number} p.exclusoes           Exclusões do LALUR (dividendos recebidos, etc.)
 * @param {number} p.saldoPrejuizoFiscal Saldo de prejuízo fiscal acumulado (LALUR Parte B)
 * @param {number} p.receitaTotal        Receita bruta do período (base para PIS/COFINS)
 * @param {number} p.creditosPisCofins   Créditos de PIS/COFINS apurados no período
 * @param {boolean} p.trimestral         Se true, usa limite trimestral do adicional
 * @param {number} p.receitaComercio     Parte da receita sujeita a ICMS (o restante é serviço, sujeito a ISS)
 * @param {number} p.aliqIcms            ICMS efetivo % sobre a receita de comércio/indústria
 * @param {number} p.aliqIss             ISS efetivo % sobre a receita de serviços
 * @returns {object}
 */
export function calcReal({
  lucroLiquido         = 0,
  adicoes              = 0,
  exclusoes            = 0,
  saldoPrejuizoFiscal  = 0,
  receitaTotal         = 0,
  creditosPisCofins    = 0,
  trimestral           = false,
  receitaComercio      = 0,
  aliqIcms             = 0,
  aliqIss              = 0,
}) {
  // LALUR Parte A — apuração do Lucro Real
  const lucroRealBruto = lucroLiquido + adicoes - exclusoes;

  // Trava de 30%: compensação limitada a 30% do Lucro Real bruto positivo (Lei 9.065/95)
  const limiteCompensacao = rnd(Math.max(0, lucroRealBruto) * (LIMITE_COMPENSACAO / 100));
  const compensacaoUsada  = rnd(Math.min(saldoPrejuizoFiscal, limiteCompensacao));
  const saldoRemanescente = rnd(Math.max(0, saldoPrejuizoFiscal - compensacaoUsada));
  const lucroReal         = rnd(Math.max(0, lucroRealBruto - compensacaoUsada));

  // IRPJ: limite do adicional varia conforme o período de apuração
  const limiteAdicional = trimestral ? IRPJ_ADICIONAL_LIMITE_TRIM : IRPJ_ADICIONAL_LIMITE_ANUAL;
  const irpj            = rnd(lucroReal * (IRPJ_ALIQUOTA / 100));
  const adicional       = rnd(Math.max(0, lucroReal - limiteAdicional) * (IRPJ_ADICIONAL / 100));
  const irpjTotal       = irpj + adicional;

  // CSLL = 9% sobre o lucro real (mesma base do IRPJ para fins de simplificação)
  const csll = rnd(lucroReal * (CSLL_ALIQUOTA / 100));

  // PIS / COFINS não-cumulativo com dedução de créditos
  const pisGross    = rnd(receitaTotal * (PIS_NAO_CUMULATIVO    / 100));
  const cofinsGross = rnd(receitaTotal * (COFINS_NAO_CUMULATIVO / 100));
  const totalAliq   = PIS_NAO_CUMULATIVO + COFINS_NAO_CUMULATIVO;
  const creditoPis    = rnd(creditosPisCofins * (PIS_NAO_CUMULATIVO    / totalAliq));
  const creditoCofins = rnd(creditosPisCofins * (COFINS_NAO_CUMULATIVO / totalAliq));
  const pis    = rnd(Math.max(0, pisGross    - creditoPis));
  const cofins = rnd(Math.max(0, cofinsGross - creditoCofins));

  const receitaComercioUsada = Math.min(receitaComercio, receitaTotal);
  const icms = rnd(receitaComercioUsada * ((Number(aliqIcms) || 0) / 100));
  const iss  = rnd((receitaTotal - receitaComercioUsada) * ((Number(aliqIss) || 0) / 100));

  const total       = rnd(irpjTotal + csll + pis + cofins + icms + iss);
  const aliqEfetiva = receitaTotal > 0 ? rnd(total / receitaTotal * 100) : 0;

  return {
    lucroLiquido, adicoes, exclusoes,
    lucroRealBruto, limiteCompensacao, compensacaoUsada, saldoRemanescente, lucroReal,
    irpj, adicional, irpjTotal,
    csll,
    pisGross, cofinsGross, creditoPis, creditoCofins, pis, cofins, icms, iss,
    total, aliqEfetiva, receitaTotal,
  };
}
