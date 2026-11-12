import { ANEXOS, LIMITE_SIMPLES, REDIST_ISS } from "../constants/tabelas.js";

// Arredondamento ABNT NBR 5891 para valores monetários (centavos)
function roundBRL(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// Mantém 9 casas decimais em valores intermediários (alíquota efetiva, proporções)
function round9(v) {
  return Math.round((v + Number.EPSILON) * 1e9) / 1e9;
}

function getFaixa(tabela, rbt12) {
  for (const faixa of tabela) {
    if (rbt12 <= faixa.limite) return faixa;
  }
  return tabela[tabela.length - 1];
}

// Fator R conforme PGDAS-D seção 8.2.1
// Trunca em 2 casas decimais SEM arredondamento (a partir de 04/2018)
export function calcFatorR(folha12, rbt12) {
  if (!folha12 || folha12 <= 0) return 0.01;
  if (!rbt12 || rbt12 <= 0) return 0.28;
  return Math.floor((folha12 / rbt12) * 100) / 100;
}

export function deveUsarAnexoIII(folha12, rbt12) {
  return calcFatorR(folha12, rbt12) >= 0.28;
}

// Calcula ICMS/ISS da 6ª faixa usando parâmetros da 5ª faixa (PGDAS-D)
function calcTributo6aFaixa(formula, rbt12, faturamentoMes, campo) {
  if (!formula) return 0;
  const { aliquota5a, deducao5a, [`rep${campo}5a`]: rep5a } = formula;
  const taxa5a = round9((rbt12 * (aliquota5a / 100) - deducao5a) / rbt12);
  return roundBRL(Math.max(0, faturamentoMes * taxa5a * (rep5a / 100)));
}

// Aplica teto de ISS de 5% e redistribui excesso — arredonda cada tributo
function aplicarTetoISS(tributos, faturamentoMes, annexKey) {
  if (!tributos.ISS || !REDIST_ISS[annexKey]) return tributos;

  const issMax = faturamentoMes * 0.05;
  if (tributos.ISS <= issMax) return tributos;

  const excesso = tributos.ISS - issMax;
  const redistPct = REDIST_ISS[annexKey];
  const ajustados = { ...tributos, ISS: roundBRL(issMax) };

  for (const [tributo, pct] of Object.entries(redistPct)) {
    ajustados[tributo] = roundBRL((ajustados[tributo] || 0) + excesso * (pct / 100));
  }
  return ajustados;
}

// Calcula o Simples Nacional conforme PGDAS-D
// rbt12: Receita Bruta dos 12 meses ANTERIORES ao PA (sem incluir o mês corrente)
// faturamentoMes: Receita do período de apuração (mês)
// annexKey: "I" | "II" | "III" | "IV" | "V"
// folha12: Folha de salários dos últimos 12 meses (para Fator R)
export function calcSimples({ rbt12, faturamentoMes, annexKey, folha12 = 0 }) {
  if (!rbt12 || rbt12 <= 0 || !faturamentoMes || faturamentoMes <= 0) {
    return { taxaEfetiva: 0, simplesAPagar: 0, faixa: null, fatorR: 0, usouFatorR: false, tributos: null };
  }

  let resolvedAnnex = annexKey;
  let usouFatorR = false;
  const fatorR = calcFatorR(folha12, rbt12);

  if (annexKey === "V" && fatorR >= 0.28) {
    resolvedAnnex = "III";
    usouFatorR = true;
  }

  const { tabela } = ANEXOS[resolvedAnnex];
  const faixa = getFaixa(tabela, rbt12);
  const e6a = faixa === tabela[tabela.length - 1] && (faixa.icmsFormula || faixa.issFormula);

  // Alíquota efetiva com 9 casas decimais (precisão intermediária)
  const taxaEfetiva = round9(Math.max(0, (rbt12 * (faixa.aliquota / 100) - faixa.deducao) / rbt12));

  // DAS bruto — NÃO arredondar aqui; tributos são calculados a partir do bruto
  const simplesAPagarBruto = faturamentoMes * taxaEfetiva;

  // Repartição: cada tributo calculado do DAS bruto e arredondado individualmente
  // (idêntico ao PGDAS-D: arredonda tributo a tributo, não o total)
  let tributos = {};
  for (const [tributo, pct] of Object.entries(faixa.rep)) {
    tributos[tributo] = roundBRL(simplesAPagarBruto * (pct / 100));
  }

  // 6ª faixa: ICMS ou ISS via fórmula especial com parâmetros da 5ª faixa
  if (e6a) {
    if (faixa.icmsFormula) {
      tributos.ICMS = calcTributo6aFaixa(faixa.icmsFormula, rbt12, faturamentoMes, "ICMS");
    }
    if (faixa.issFormula) {
      tributos.ISS = calcTributo6aFaixa(faixa.issFormula, rbt12, faturamentoMes, "ISS");
    }
  }

  // ISS: teto de 5% com redistribuição proporcional
  tributos = aplicarTetoISS(tributos, faturamentoMes, resolvedAnnex);

  // Total DAS = soma dos tributos já arredondados — igual ao PGDAS-D
  const simplesAPagar = roundBRL(Object.values(tributos).reduce((s, v) => s + v, 0));

  return {
    taxaEfetiva: taxaEfetiva * 100, // em %
    simplesAPagar,
    faixa: { ...faixa, anexo: resolvedAnnex },
    fatorR,
    usouFatorR,
    acimaDolimite: rbt12 > LIMITE_SIMPLES,
    tributos,
  };
}

// Calcula projeção anual com RBT12 atualizado mês a mês
// RBT12 de cada mês = soma dos 12 meses ANTERIORES a ele (não inclui o próprio mês)
export function calcProjecaoAnual({ historico, annexKey, folha12 = 0 }) {
  return historico.map((entry, idx) => {
    const anteriores = historico.slice(0, idx);
    const janela = anteriores.slice(-12);
    const n = janela.length;
    const soma = janela.reduce((s, e) => s + e.faturamento, 0);
    const rbt12 = n === 0 ? 0 : n >= 12 ? soma : (soma / n) * 12;
    const resultado = calcSimples({ rbt12, faturamentoMes: entry.faturamento, annexKey, folha12 });
    return { ...entry, rbt12, ...resultado };
  });
}
