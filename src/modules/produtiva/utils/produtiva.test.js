import assert from "node:assert/strict";
import test from "node:test";
import { extractDocuments, formatDocument, isValidCnpj, isValidCpf, matchClientDocument } from "./documents.js";
import { descendantFolderIds, isTrashExpired, safeFileName, trashDaysLeft } from "./drive.js";
import { recurrenceDueDate } from "./recurrence.js";

test("valida CPF e CNPJ pelos dígitos verificadores", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("11111111111"), false);
});

test("formata documento", () => {
  assert.equal(formatDocument("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatDocument("52998224725"), "529.982.247-25");
});

test("extrai documentos válidos do texto, sem duplicatas", () => {
  const text = "Cliente 11.222.333/0001-81 CPF 529.982.247-25 de novo 11222333000181 inválido 11.222.333/0001-82";
  assert.deepEqual(extractDocuments(text), { cnpjs: ["11222333000181"], cpfs: ["52998224725"] });
});

test("encontra o cliente e ignora o CNPJ do escritório", () => {
  const office = "11.444.777/0001-61";
  const text = `Produtiva Contabilidade ${office} — Guia do cliente 11.222.333/0001-81`;
  const known = new Set(["11444777000161", "11222333000181"]);
  assert.equal(matchClientDocument(text, known, office), "11222333000181");
  assert.equal(matchClientDocument(text, new Set(["99999999999999"]), office), null);
});

test("lixeira expira em 20 dias", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  assert.equal(isTrashExpired("2026-11-01T12:00:00Z", now), true);
  assert.equal(isTrashExpired("2026-11-02T12:00:00Z", now), false);
  assert.equal(trashDaysLeft("2026-11-11T12:00:00Z", now), 10);
});

test("nome de arquivo seguro", () => {
  assert.equal(safeFileName("Guia DAS — março/2026 (cópia).pdf"), "Guia DAS _ marco_2026 _copia_.pdf");
});

test("subpastas entram junto na lixeira", () => {
  const folders = [
    { id: "a", parent_id: null }, { id: "b", parent_id: "a" },
    { id: "c", parent_id: "b" }, { id: "d", parent_id: null },
  ];
  assert.deepEqual([...descendantFolderIds(folders, "a")].sort(), ["a", "b", "c"]);
});

test("vencimento mensal com prazo no mês seguinte", () => {
  const das = { cadence: "MENSAL", due_day: 20, due_month_offset: 1 };
  assert.equal(recurrenceDueDate(das, "2026-10"), "2026-11-20");
  assert.equal(recurrenceDueDate(das, "2026-12"), "2027-01-20");
});

test("vencimento mensal sem offset mantém o comportamento antigo", () => {
  assert.equal(recurrenceDueDate({ cadence: "MENSAL", due_day: 31 }, "2026-02"), "2026-02-28");
});

test("trimestral só gera no fim do trimestre", () => {
  const irpj = { cadence: "TRIMESTRAL", due_day: 31, due_month_offset: 1 };
  assert.equal(recurrenceDueDate(irpj, "2026-03"), "2026-04-30");
  assert.equal(recurrenceDueDate(irpj, "2026-04"), null);
});

test("anual só gera no mês do prazo", () => {
  const defis = { cadence: "ANUAL", due_day: 31, due_month: 3 };
  assert.equal(recurrenceDueDate(defis, "2026-03"), "2026-03-31");
  assert.equal(recurrenceDueDate(defis, "2026-04"), null);
});
