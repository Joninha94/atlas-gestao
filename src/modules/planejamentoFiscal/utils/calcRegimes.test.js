import assert from "node:assert/strict";
import test from "node:test";
import { calcPresumido } from "./calcPresumido.js";
import { calcReal } from "./calcReal.js";

test("Presumido cobra ISS sobre serviços e ICMS sobre comércio, somando ao total", () => {
  const semAliquota = calcPresumido({ receitaServicos: 300000, atividadeServicos: "servicos_profissionais" });
  const comAliquota = calcPresumido({
    receitaServicos: 300000, receitaComercio: 100000,
    atividadeServicos: "servicos_profissionais", aliqIss: 5, aliqIcms: 12,
  });
  assert.equal(semAliquota.iss, 0);
  assert.equal(comAliquota.iss, 15000);
  assert.equal(comAliquota.icms, 12000);
  const semImpostosLocais = calcPresumido({
    receitaServicos: 300000, receitaComercio: 100000, atividadeServicos: "servicos_profissionais",
  });
  assert.equal(comAliquota.total, semImpostosLocais.total + 27000);
});

test("Real separa ICMS (comércio) e ISS (restante da receita)", () => {
  const res = calcReal({ lucroLiquido: 100000, receitaTotal: 1000000, receitaComercio: 400000, aliqIcms: 10, aliqIss: 2 });
  assert.equal(res.icms, 40000);
  assert.equal(res.iss, 12000);
  const base = calcReal({ lucroLiquido: 100000, receitaTotal: 1000000 });
  assert.equal(res.total, base.total + 52000);
});
