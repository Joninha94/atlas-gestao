// Parser de fatura de cartão de crédito em PDF — testado com o layout do
// Banco do Brasil (OUROCARD), mas compatível com qualquer fatura cujo PDF
// siga o padrão: "DD/MM  Descrição  [País]  R$ VALOR".

// Reconstrução de linhas a partir dos itens de texto do PDF.js.
function buildLines(items) {
  const TOLERANCE = 3;
  const buckets = [];

  for (const item of items) {
    const y = item.transform[5];
    const x = item.transform[4];
    const str = item.str || "";
    if (!str.trim()) continue;

    let bucket = buckets.find((b) => Math.abs(b.y - y) <= TOLERANCE);
    if (!bucket) {
      bucket = { y, parts: [] };
      buckets.push(bucket);
    }
    bucket.parts.push({ x, str });
  }

  buckets.sort((a, b) => b.y - a.y);
  return buckets.map((b) =>
    b.parts.sort((a, c) => a.x - c.x).map((p) => p.str).join(" ").replace(/\s+/g, " ").trim()
  );
}

// Detecta padrão de parcelas na linha: "PARC XX/YY" → { current, total }
function detectInstallments(text) {
  const m = text.match(/PARC\s*(\d+)\/(\d+)/i);
  if (!m) return null;
  return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
}

// Limpa a descrição: remove país e "PARC X/Y"
function cleanDesc(raw) {
  return raw
    .replace(/\bPARC\s*\d+\/\d+\b/gi, "")
    .replace(/\s+\b(BR|EUA|ARG|EUR|USA|PT)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Parseia o valor monetário: "18.084,25" → 18084.25  "-8.000,00" → -8000
function parseBRL(str) {
  return parseFloat(str.replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
}

// Seções reconhecidas como indicadores de categoria
const SECTION_CATEGORY = {
  "lazer":             "Academia",
  "restaurantes":      "Restaurantes",
  "saude":             "Plano de saúde",
  "servicos":          "Outros",
  "outros lancamentos": "Outros",
  "supermercado":      "Supermercado",
  "farmacia":          "Farmácia",
  "combustivel":       "Combustível",
  "vestuario":         "Roupas",
  "educacao":          "Escola",
  "transporte":        "Transporte público",
};

function sectionCategory(header) {
  const n = header.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return SECTION_CATEGORY[n] || null;
}

// Sugere categoria pelo nome do estabelecimento
function autoCategory(desc) {
  const d = desc.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/SUPERMERCADO|MERCADO|ATACADO|CESTA/.test(d))         return "Supermercado";
  if (/ACOUGUE|BOUTIQUE\s?CARNES/.test(d))                  return "Açougue";
  if (/PADARIA|PANIF/.test(d))                              return "Padaria";
  if (/POSTO|COMBUSTIV|SHELL|IPIRANGA|RAIZEN/.test(d))      return "Combustível";
  if (/FARMACIA|DROGARIA|RAIA|PAGUE\s?MENOS|RDSAUDE/.test(d)) return "Farmácia";
  if (/ACADEMIA|SMARTFIT|GYMPASS/.test(d))                  return "Academia";
  if (/NETFLIX|SPOTIFY|GLOBOPLAY|DISNEY|YOUTUBE/.test(d))   return "Streaming de vídeo";
  if (/APPLE\.COM|APPLE\.BILL/.test(d))                     return "Streaming de vídeo";
  if (/IFD\*|IFOOD|RAPPI/.test(d))                          return "Delivery";
  if (/RESTAUR|LANCHON|CHURRASCO|PIZZA/.test(d))            return "Restaurantes";
  if (/UBER/.test(d))                                       return "Uber/99";
  if (/AMAZON/.test(d))                                     return "Compras";
  if (/DELL\b|APPLE\b|SAMSUNG/.test(d))                     return "Notebook";
  if (/CLINICA|ODONT|NUTRI|MEDIC/.test(d))                  return "Consultas médicas";
  if (/DM\*SPOTIFY|SPOTIFY/.test(d))                        return "Streaming de música";
  if (/SEGURO|AZUL\s?SEGURO/.test(d))                       return "Seguro do veículo";
  if (/ANUIDADE/.test(d))                                   return "Tarifas bancárias";
  return "";
}

// Padrão de linha de transação
const TXN_RE = /^(\d{2}\/\d{2})\s+(.+?)\s+R\$\s*(-?[\d.,]+)\s*$/;

// Seções de pagamento (créditos na fatura → ignoradas)
const PAYMENT_SECTIONS = /pagamentos?|cr[eé]ditos?|saldo.+anterior|saldo.+dia/i;

// Seção "Compras parceladas": contém parcelas de compras de MESES ANTERIORES
// que já aparecem na fatura mas NÃO são lançamentos do mês atual.
// Devem ser ignoradas — o usuário já as tem registradas (ou vai registrá-las
// separadamente via fatura do mês de origem).
const OLD_INSTALLMENTS_SECTION = /compras?\s+parceladas?/i;

// Linhas a descartar sempre
const SKIP_LINE = /saldo.+(anterior|dia|fatura)|total.+fatura|valor.+fatura|^pagamento\s+m[ií]nimo|^resumo.+fatura|^op[çc][oõ]es|^informa[çc][oõ]es|^datas\s+fatura|^fechamento|^melhor\s+data|^limite|^iof|^juros|^encargos|^pontos|^fale|^central/i;

// Detecta o mês/ano de fechamento da fatura E a data de vencimento (ISO).
function detectBillingPeriod(lines) {
  let dueDate = null;

  for (const line of lines) {
    // "Fatura fechada em 30/06/2026"
    let m = line.match(/fatura\s+fechada\s+em\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) return { month: parseInt(m[2], 10), year: parseInt(m[3], 10), dueDate };

    // "Período: 01 a 30/06/2026"
    m = line.match(/per[ií]odo.*?\d{2}\s+a\s+\d{2}\/(\d{2})\/(\d{4})/i);
    if (m) return { month: parseInt(m[1], 10), year: parseInt(m[2], 10), dueDate };

    // "Vencimento 10/07/2026" — salva a data de vencimento em ISO e calcula billing
    m = line.match(/vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) {
      const [, dd, mm, yyyy] = m;
      dueDate = `${yyyy}-${mm}-${dd}`; // ex: "2026-07-10"
      let month = parseInt(mm, 10) - 1;
      let year  = parseInt(yyyy, 10);
      if (month === 0) { month = 12; year--; }
      return { month, year, dueDate };
    }
  }
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// Dado o DD/MM da linha e o período de referência da fatura, retorna "YYYY-MM-DD".
// Se o mês da linha for FUTURO em relação ao mês da fatura, pertence ao ano anterior.
// Ex.: fatura de junho/2026 com linha "29/05" → 2026-05-29 (maio do mesmo ano).
//      fatura de janeiro/2026 com linha "12/12" → 2025-12-12 (dezembro do ano anterior).
function resolveDate(dd, mm, billingMonth, billingYear) {
  const txMonth = parseInt(mm, 10);
  let year = billingYear;
  // Linha com mês DEPOIS do fechamento → é do ano anterior (ciclo anterior)
  if (txMonth > billingMonth + 1) year = billingYear - 1;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// ---- Ponto de entrada --------------------------------------------------------

export async function parseCardPDF(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    buildLines(content.items).forEach((l) => allLines.push(l));
  }

  // 1. Detecta o período de fechamento da fatura para corrigir o ano das datas
  const { month: billingMonth, year: billingYear, dueDate } = detectBillingPeriod(allLines);

  const transactions = [];
  let currentSectionCategory = null;
  let inPaymentSection     = false;
  let inOldInstallments    = false; // seção "Compras parceladas" — ignorada por completo
  let idCounter = 0;

  for (const line of allLines) {
    if (SKIP_LINE.test(line)) continue;

    // Seção de parcelas antigas → ignorar todo o conteúdo daqui em diante
    if (OLD_INSTALLMENTS_SECTION.test(line) && !TXN_RE.test(line)) {
      inOldInstallments = true;
      continue;
    }
    if (inOldInstallments) continue;

    // Seção de pagamentos/créditos
    if (PAYMENT_SECTIONS.test(line) && !TXN_RE.test(line)) {
      inPaymentSection = true;
      currentSectionCategory = null;
      continue;
    }

    // Qualquer outro cabeçalho de seção → volta ao modo normal
    const secCat = sectionCategory(line);
    if (secCat !== null) {
      inPaymentSection = false;
      currentSectionCategory = secCat;
      continue;
    }

    const m = line.match(TXN_RE);
    if (!m) continue;

    const [, rawDate, rawDesc, rawAmt] = m;
    const amount = parseBRL(rawAmt);

    if (inPaymentSection || amount < 0 || amount === 0) continue;

    const installments = detectInstallments(rawDesc);
    const description  = cleanDesc(rawDesc);
    const category     = autoCategory(description) || currentSectionCategory || "";

    const [dd, mm] = rawDate.split("/");
    const dateISO = resolveDate(dd, mm, billingMonth, billingYear);

    transactions.push({
      id:           `pdf-${++idCounter}`,
      date:         dateISO,
      amount,
      description,
      category,
      installments,
    });
  }

  if (transactions.length === 0) {
    throw new Error(
      "Nenhum lançamento encontrado no PDF. Confirme que é uma fatura de cartão válida."
    );
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  // Retorna também o período detectado para exibir no modal
  return { transactions, billingMonth, billingYear, dueDate };
}
