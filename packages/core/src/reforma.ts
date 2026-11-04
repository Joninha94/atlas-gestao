/**
 * Calculadora da reforma tributária (IBS/CBS) — projeção simplificada para consultoria.
 *
 * IMPORTANTE: todas as alíquotas são PREMISSAS EDITÁVEIS pelo usuário. Os valores padrão
 * abaixo são apenas ponto de partida e devem ser revisados pelo time fiscal conforme a
 * legislação vigente (LC 214/2025 e regulamentações). O sistema mostra as premissas na tela.
 */

export interface ReformPremises {
  year: number;
  cbsRate: number; // ex.: 0.088 = 8,8%
  ibsRate: number; // ex.: 0.001 = 0,1%
  creditablePurchaseShare: number; // fração das compras que gera crédito (0..1)
  simplesEffectiveRate: number; // alíquota efetiva atual do Simples
  simplesShareReplacedByIbsCbs: number; // parcela do DAS que corresponde a PIS/COFINS/ICMS/ISS (0..1)
}

export interface ReformInput {
  annualRevenue: number;
  annualPurchases: number;
  b2bRevenueShare: number; // fração da receita vendida a empresas que tomam crédito
}

export interface ReformResult {
  year: number;
  simplesNormal: { totalTax: number; creditPassedToCustomers: number };
  simplesHibrido: { totalTax: number; creditPassedToCustomers: number };
  recommendation: 'SIMPLES_NORMAL' | 'SIMPLES_HIBRIDO';
  reasons: string[];
}

/**
 * Compara Simples "normal" (IBS/CBS dentro do DAS) com o regime híbrido
 * (IBS/CBS recolhidos por fora, com débito e crédito). O ganho do híbrido vem do
 * crédito integral repassado aos clientes PJ.
 */
export function compareSimplesRegimes(input: ReformInput, p: ReformPremises): ReformResult {
  const rate = p.cbsRate + p.ibsRate;
  const das = input.annualRevenue * p.simplesEffectiveRate;

  // Simples normal: paga o DAS inteiro; crédito repassado limitado ao que o DAS contém.
  const normalCredit = input.annualRevenue * input.b2bRevenueShare * p.simplesEffectiveRate * p.simplesShareReplacedByIbsCbs;

  // Híbrido: DAS sem a parcela de IBS/CBS + IBS/CBS por fora (débito − crédito).
  const dasWithout = das * (1 - p.simplesShareReplacedByIbsCbs);
  const debit = input.annualRevenue * rate;
  const credit = Math.max(0, input.annualPurchases) * p.creditablePurchaseShare * rate;
  const hybridTax = dasWithout + Math.max(0, debit - credit);
  const hybridCredit = input.annualRevenue * input.b2bRevenueShare * rate;

  const normalTotal = round(das);
  const hybridTotal = round(hybridTax);
  const reasons: string[] = [];
  const extraCost = hybridTotal - normalTotal;
  const extraCreditToCustomers = round(hybridCredit - normalCredit);

  if (input.b2bRevenueShare >= 0.5) reasons.push(`${Math.round(input.b2bRevenueShare * 100)}% da receita é para empresas, que valorizam crédito integral.`);
  if (extraCost <= 0) reasons.push('O híbrido não aumenta a carga total com as premissas informadas.');
  else reasons.push(`O híbrido custa R$ ${extraCost.toFixed(2)} a mais por ano.`);
  reasons.push(`Crédito adicional repassado aos clientes no híbrido: R$ ${extraCreditToCustomers.toFixed(2)}.`);

  // Recomenda híbrido quando o custo extra é menor que o crédito extra entregue a clientes PJ.
  const recommendation = extraCost < extraCreditToCustomers ? 'SIMPLES_HIBRIDO' : 'SIMPLES_NORMAL';

  return {
    year: p.year,
    simplesNormal: { totalTax: normalTotal, creditPassedToCustomers: round(normalCredit) },
    simplesHibrido: { totalTax: hybridTotal, creditPassedToCustomers: round(hybridCredit) },
    recommendation,
    reasons,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
