import assert from "node:assert/strict";
import test from "node:test";
import { calcComparativoSimplesHibrido } from "./calcComparativoSimplesHibrido.js";
import { calcSimples } from "../../simplesNacional/utils/calcSimples.js";

function scenario(overrides = {}) {
  return {
    anexo: "I",
    receitaMensal: "100000",
    rbt12: "1200000",
    folha12: "0",
    comprasMensais: "40000",
    comprasFornecedorRegular: "100",
    comprasFornecedorSimples: "0",
    clientesB2B: "50",
    mixZero: "0",
    mix60: "0",
    mix40: "0",
    mix30: "0",
    custoConformidadeMensal: "0",
    encargosForaDAS: "0",
    issFixo: false,
    ...overrides,
  };
}

test("returns no result until monthly revenue is provided", () => {
  assert.equal(calcComparativoSimplesHibrido(scenario({ receitaMensal: "" })), null);
});

test("rejects a sales mix greater than 100 percent", () => {
  const result = calcComparativoSimplesHibrido(scenario({ mix60: "60", mix30: "50" }));
  assert.equal(result.valid, false);
  assert.match(result.error, /mix de vendas/);
});

test("rejects a supplier mix greater than 100 percent", () => {
  const result = calcComparativoSimplesHibrido(scenario({
    comprasFornecedorRegular: "80",
    comprasFornecedorSimples: "30",
  }));
  assert.equal(result.valid, false);
  assert.match(result.error, /mix de fornecedores/);
});

test("applies sales reductions to hybrid IBS/CBS debits", () => {
  const noReduction = calcComparativoSimplesHibrido(scenario());
  const halfZeroRated = calcComparativoSimplesHibrido(scenario({ mixZero: "50" }));

  assert.equal(noReduction.valid, true);
  assert.equal(halfZeroRated.valid, true);
  assert.ok(halfZeroRated.hybridAnnual < noReduction.hybridAnnual);
  assert.equal(halfZeroRated.normalAnnual, noReduction.normalAnnual);
});

test("uses Anexo III when a professional activity meets Fator R", () => {
  const result = calcComparativoSimplesHibrido(scenario({
    anexo: "V",
    receitaMensal: "100000",
    rbt12: "1200000",
    folha12: "360000",
  }));

  assert.equal(result.valid, true);
  assert.equal(result.usedFatorR, true);
  assert.equal(result.annex, "III");
  assert.equal(result.fatorR, 0.3);
});

test("credits purchases according to the supplier regime mix", () => {
  const noCreditablePurchases = calcComparativoSimplesHibrido(scenario({
    comprasFornecedorRegular: "0",
    comprasFornecedorSimples: "0",
  }));
  const regularPurchases = calcComparativoSimplesHibrido(scenario({
    comprasFornecedorRegular: "100",
    comprasFornecedorSimples: "0",
  }));

  assert.equal(noCreditablePurchases.valid, true);
  assert.equal(regularPurchases.valid, true);
  assert.ok(regularPurchases.hybridAnnual < noCreditablePurchases.hybridAnnual);
});

test("uses a manually provided CBS reference rate for debits and credits", () => {
  const referenceRate = calcComparativoSimplesHibrido(scenario());
  const customRate = calcComparativoSimplesHibrido(scenario({ aliqCbsReferencia: "10" }));

  assert.equal(referenceRate.valid, true);
  assert.equal(customRate.valid, true);
  assert.equal(referenceRate.cbsRateOverride, 0.088);
  assert.equal(customRate.cbsRateOverride, 0.1);
  assert.equal(customRate.cbsDue, 6000);
  assert.equal(customRate.creditCbs, 4000);
  assert.ok(customRate.cbsDue > referenceRate.cbsDue);
  assert.ok(customRate.creditCbs > referenceRate.creditCbs);
});

test("uses a manually provided IBS reference rate independently of CBS", () => {
  const referenceRate = calcComparativoSimplesHibrido(scenario());
  const customIbs = calcComparativoSimplesHibrido(scenario({ aliqIbsReferencia: "5" }));

  assert.equal(referenceRate.ibsRateOverride, 0.001);
  assert.equal(customIbs.ibsRateOverride, 0.05);
  assert.equal(customIbs.ibsDue, 3000);
  assert.equal(customIbs.creditIbs, 2000);
  assert.equal(customIbs.cbsRateOverride, referenceRate.cbsRateOverride);
  assert.equal(customIbs.cbsDue, referenceRate.cbsDue);
});

test("accounts for fixed municipal ISS outside the DAS when enabled", () => {
  const withoutFixedIss = calcComparativoSimplesHibrido(scenario({ anexo: "III" }));
  const withFixedIss = calcComparativoSimplesHibrido(scenario({
    anexo: "III",
    issFixo: true,
    issFixoProfissionais: "2",
    issFixoPorProfissional: "100",
  }));

  assert.equal(withoutFixedIss.valid, true);
  assert.equal(withFixedIss.valid, true);
  assert.equal(withFixedIss.fixedIss, 200);
  const simples = calcSimples({ rbt12: 1200000, faturamentoMes: 100000, annexKey: "III" });
  assert.equal(withFixedIss.dasNormal, simples.simplesAPagar - simples.tributos.ISS);
});
