// Catálogo de obrigações e processos-modelo, portado do seed do
// produtiva-gestao (packages/db/prisma/seed.ts). Os prazos são PONTO DE
// PARTIDA: o time fiscal deve conferir a cada ano (feriados, prorrogações,
// "dia útil" vs. dia corrido e mudanças de legislação).
//
// cadence NENHUMA = processo avulso, aplicado manualmente como tarefa.
// offset = meses entre a competência e o prazo (1 = mês seguinte).

const SN = ["SIMPLES"];
const LP_LR = ["PRESUMIDO", "REAL"];
const COM_FOLHA = ["SIMPLES", "PRESUMIDO", "REAL", "MEI", "OUTRO"];

export const OBLIGATION_CATALOG = [
  // Fiscal — mensais
  { key: "pgdas", title: "PGDAS-D e DAS", category: "Simples Nacional", taskType: "FISCAL", regimes: SN, cadence: "MENSAL", dueDay: 20, offset: 1, fine: true, steps: ["Conferir faturamento", "Transmitir PGDAS-D", "Enviar DAS ao cliente"] },
  { key: "das-mei", title: "DAS-MEI", category: "MEI", taskType: "FISCAL", regimes: ["MEI"], cadence: "MENSAL", dueDay: 20, offset: 1, steps: ["Enviar DAS-MEI ao cliente"] },
  { key: "dctfweb", title: "DCTFWeb", category: "Federal", taskType: "PESSOAL", regimes: COM_FOLHA, cadence: "MENSAL", dueDay: 15, offset: 1, fine: true, steps: ["Conferir eventos eSocial/EFD-Reinf", "Transmitir DCTFWeb", "Enviar DARF ao cliente"] },
  { key: "reinf", title: "EFD-Reinf", category: "Federal", taskType: "FISCAL", regimes: [...SN, ...LP_LR], cadence: "MENSAL", dueDay: 15, offset: 1, fine: true, steps: ["Lançar retenções", "Transmitir EFD-Reinf"] },
  { key: "sped-fiscal", title: "EFD ICMS/IPI (SPED Fiscal)", category: "Estadual", taskType: "FISCAL", regimes: LP_LR, cadence: "MENSAL", dueDay: 15, offset: 1, fine: true, steps: ["Importar XMLs", "Validar no PVA", "Transmitir"] },
  { key: "efd-contrib", title: "EFD-Contribuições", category: "Federal", taskType: "FISCAL", regimes: LP_LR, cadence: "MENSAL", dueDay: 10, offset: 2, fine: true, steps: ["Apurar PIS/COFINS", "Validar no PVA", "Transmitir"] },
  { key: "pis-cofins", title: "Apuração PIS/COFINS", category: "Federal", taskType: "FISCAL", regimes: LP_LR, cadence: "MENSAL", dueDay: 25, offset: 1, fine: true, steps: ["Apurar", "Gerar DARF", "Enviar ao cliente"] },
  { key: "icms", title: "Apuração ICMS", category: "Estadual", taskType: "FISCAL", regimes: LP_LR, cadence: "MENSAL", dueDay: 10, offset: 1, fine: true, steps: ["Apurar", "Gerar guia", "Enviar ao cliente"] },
  { key: "iss", title: "Apuração ISS", category: "Municipal", taskType: "FISCAL", regimes: LP_LR, cadence: "MENSAL", dueDay: 10, offset: 1, fine: true, steps: ["Conferir NFS-e prestadas e tomadas", "Gerar guia", "Enviar ao cliente"] },
  { key: "parcelamentos", title: "Parcelamentos", category: "Federal", taskType: "FISCAL", regimes: [...SN, "MEI", ...LP_LR], cadence: "MENSAL", dueDay: 28, offset: 0, steps: ["Enviar parcela ao cliente"] },
  // Pessoal — mensais
  { key: "folha", title: "Folha de pagamento", category: "Pessoal", taskType: "PESSOAL", regimes: COM_FOLHA, cadence: "MENSAL", dueDay: 5, offset: 1, steps: ["Receber variáveis", "Calcular folha", "Enviar holerites"] },
  { key: "esocial", title: "eSocial (fechamento)", category: "Pessoal", taskType: "PESSOAL", regimes: COM_FOLHA, cadence: "MENSAL", dueDay: 15, offset: 1, fine: true, steps: ["Enviar eventos periódicos", "Fechar competência"] },
  { key: "fgts", title: "FGTS Digital", category: "Pessoal", taskType: "PESSOAL", regimes: COM_FOLHA, cadence: "MENSAL", dueDay: 20, offset: 1, fine: true, steps: ["Conferir guia", "Enviar guia ao cliente"] },
  { key: "pro-labore", title: "Pró-labore", category: "Pessoal", taskType: "PESSOAL", regimes: [...SN, ...LP_LR], cadence: "MENSAL", dueDay: 5, offset: 1, steps: ["Calcular pró-labore", "Enviar recibo"] },
  // Contábil — mensais
  { key: "conciliacao", title: "Conciliação bancária", category: "Contábil", taskType: "CONTABIL", regimes: [...SN, ...LP_LR], cadence: "MENSAL", dueDay: 25, offset: 1, steps: ["Importar extratos", "Conciliar", "Revisar pendências"] },
  { key: "balancete", title: "Balancete mensal", category: "Contábil", taskType: "CONTABIL", regimes: LP_LR, cadence: "MENSAL", dueDay: 30, offset: 1, steps: ["Fechar lançamentos", "Emitir balancete", "Enviar ao cliente"] },
  // Trimestrais
  { key: "irpj-csll", title: "IRPJ/CSLL trimestral", category: "Federal", taskType: "FISCAL", regimes: ["PRESUMIDO"], cadence: "TRIMESTRAL", dueDay: 31, offset: 1, fine: true, steps: ["Apurar IRPJ e CSLL", "Gerar DARF", "Enviar ao cliente"] },
  // Anuais
  { key: "defis", title: "DEFIS", category: "Simples Nacional", taskType: "FISCAL", regimes: SN, cadence: "ANUAL", dueDay: 31, dueMonth: 3, fine: true, steps: ["Levantar informações socioeconômicas", "Transmitir DEFIS", "Enviar recibo"] },
  { key: "dasn-simei", title: "DASN-SIMEI", category: "MEI", taskType: "FISCAL", regimes: ["MEI"], cadence: "ANUAL", dueDay: 31, dueMonth: 5, fine: true, steps: ["Conferir faturamento anual", "Transmitir DASN-SIMEI"] },
  { key: "ecd", title: "ECD", category: "Contábil", taskType: "CONTABIL", regimes: LP_LR, cadence: "ANUAL", dueDay: 30, dueMonth: 6, fine: true, steps: ["Encerrar exercício", "Gerar e validar ECD", "Assinar e transmitir"] },
  { key: "ecf", title: "ECF", category: "Contábil", taskType: "CONTABIL", regimes: LP_LR, cadence: "ANUAL", dueDay: 31, dueMonth: 7, fine: true, steps: ["Importar ECD", "Preencher blocos", "Transmitir ECF"] },
  { key: "informes", title: "RAIS / informe de rendimentos", category: "Pessoal", taskType: "PESSOAL", regimes: COM_FOLHA, cadence: "ANUAL", dueDay: 28, dueMonth: 2, steps: ["Gerar informes", "Enviar aos colaboradores"] },
  { key: "ferias-coletivas", title: "Férias coletivas (programação)", category: "Pessoal", taskType: "PESSOAL", regimes: COM_FOLHA, cadence: "ANUAL", dueDay: 15, dueMonth: 11, steps: ["Consultar cliente", "Comunicar órgãos", "Calcular férias"] },
  // Processos avulsos
  { key: "admissao", title: "Admissão de colaborador", category: "Pessoal", taskType: "PESSOAL", regimes: [], cadence: "NENHUMA", steps: ["Receber documentos", "Exame admissional", "Registrar no eSocial", "Enviar contrato ao cliente"] },
  { key: "rescisao", title: "Rescisão sem justa causa", category: "Pessoal", taskType: "PESSOAL", regimes: [], cadence: "NENHUMA", steps: ["Calcular rescisão", "Gerar guia FGTS rescisória", "Enviar TRCT e guias ao cliente"] },
  { key: "abertura", title: "Abertura de empresa", category: "Societário", taskType: "SOCIETARIO", regimes: [], cadence: "NENHUMA", steps: ["Viabilidade", "Registro na Junta", "CNPJ", "Inscrições estadual/municipal", "Alvará", "Cadastrar no sistema"] },
  { key: "alteracao", title: "Alteração contratual", category: "Societário", taskType: "SOCIETARIO", regimes: [], cadence: "NENHUMA", steps: ["Minuta", "Assinaturas", "Registro na Junta", "Atualizar cadastros"] },
];

export const RECURRING_CATALOG = OBLIGATION_CATALOG.filter(item => item.cadence !== "NENHUMA");
export const ONE_OFF_CATALOG = OBLIGATION_CATALOG.filter(item => item.cadence === "NENHUMA");

// Etapas viram uma lista numerada na descrição da tarefa.
export function catalogDescription(item) {
  const steps = item.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return item.fine ? `${steps}\n\nGera multa se atrasar.` : steps;
}
