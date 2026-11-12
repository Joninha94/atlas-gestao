/**
 * Parser de PGDAS-D — Programa Gerador do Documento de Arrecadação do Simples Nacional
 *
 * Extrai de cada PDF:
 *   cnpj, nome, pa (AAAA-MM), receitaBruta, rbt12, das, aliqEfetiva,
 *   fatorR, folha12, anexo (inferido), tributos
 *
 * Compatível com os formatos do PGDAS-D de 2018 até 2026.
 * Texto extraído pelo PDF.js — funciona apenas com PDFs gerados digitalmente
 * (não funciona com PDFs escaneados/imagens).
 */

// ── Reconstrução de linhas (idêntico ao cardPdf.js) ──────────────────────────
function buildLines(items) {
  const TOL = 3;
  const buckets = [];
  for (const item of items) {
    const y   = item.transform[5];
    const x   = item.transform[4];
    const str = (item.str || "").replace(/ /g, " "); // NBSP → space
    if (!str.trim()) continue;
    let b = buckets.find(b => Math.abs(b.y - y) <= TOL);
    if (!b) { b = { y, parts: [] }; buckets.push(b); }
    b.parts.push({ x, str });
  }
  buckets.sort((a, b) => b.y - a.y);
  return buckets.map(b =>
    b.parts.sort((a, c) => a.x - c.x).map(p => p.str).join(" ").replace(/\s+/g, " ").trim()
  );
}

// ── Helpers de parse ──────────────────────────────────────────────────────────
function parseBRL(s) {
  if (!s) return 0;
  const clean = s.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function parsePct(s) {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".")) || 0;
}

function paToYM(pa) {
  const m = String(pa).match(/(\d{2})[\s/](\d{4})/);
  if (!m) return null;
  return `${m[2]}-${m[1]}`;
}

// Junta todas as linhas em string normalizada para regex
function joinedText(lines) {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

// Procura em lista de padrões, retorna primeiro match[1] ou null
function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

// ── Inferência de Anexo ───────────────────────────────────────────────────────
function inferirAnexo(text, tributos) {
  // 1. Menção explícita: "Tabela I", "Anexo III" etc.
  const explicit = text.match(
    /(?:Tabela|Anexo)\s*(I{1,3}V?|IV|V|[1-5])\b/i
  );
  if (explicit) {
    const raw = explicit[1].toUpperCase();
    const MAP = { "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V" };
    return MAP[raw] || raw;
  }

  // 2. Presença de IPI → Anexo II (indústria)
  if (tributos.IPI > 0) return "II";

  // 3. Presença de ICMS (sem ISS) → Anexo I (comércio)
  if (tributos.ICMS > 0 && !tributos.ISS) return "I";

  // 4. ICMS + ISS → I (casos raros de CNAE duplo, default comércio)
  if (tributos.ICMS > 0 && tributos.ISS > 0) return "I";

  // 5. ISS → serviços (III, IV ou V) — sem forma de distinguir, default III
  if (tributos.ISS > 0) return "III";

  // 6. Só CPP/IRPJ/CSLL/PIS/COFINS → mais provável III ou IV
  return "III";
}

// ── Extração de tributos ──────────────────────────────────────────────────────
function extrairTributos(text) {
  function v(label) {
    // Busca padrões como "IRPJ 270,00" ou "IRPJ: R$ 270,00"
    const re = new RegExp(
      label + "[^\\d]*R?\\$?\\s*([\\d.,]+)", "i"
    );
    const m = text.match(re);
    return m ? parseBRL(m[1]) : 0;
  }
  return {
    IRPJ:   v("IRPJ"),
    CSLL:   v("CSLL"),
    COFINS: v("COFINS"),
    PIS:    v("PIS"),
    CPP:    v("CPP"),
    ICMS:   v("ICMS"),
    ISS:    v("ISS"),
    IPI:    v("IPI"),
  };
}

// ── Parser principal ──────────────────────────────────────────────────────────
export async function parsePgdasPdf(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // pdfjs-dist v6 usa ReadableStream[Symbol.asyncIterator] que não existe em alguns browsers.
  // Este polyfill conserta sem afetar browsers que já suportam.
  if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
    ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/standard_fonts/",
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    buildLines(content.items).forEach(l => allLines.push(l));
  }

  const norm  = joinedText(allLines);        // string completa para regex
  const lower = norm.toLowerCase();

  // ── Verificação básica ───────────────────────────────────────────────────
  const isPgdas =
    lower.includes("pgdas") ||
    lower.includes("simples nacional") ||
    lower.includes("período de apuração") ||
    lower.includes("receita bruta");

  if (!isPgdas) {
    return { erro: "O PDF não parece ser um PGDAS-D. Verifique o arquivo." };
  }

  // ── CNPJ ─────────────────────────────────────────────────────────────────
  const cnpjRaw = firstMatch(norm, [
    /CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i,
    /C\.N\.P\.J\.[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i,
    /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/,
  ]);
  const cnpj = cnpjRaw ? cnpjRaw.replace(/\D/g, "") : null;

  // ── Nome / Razão Social ───────────────────────────────────────────────────
  const nome = firstMatch(norm, [
    /Raz[ãa]o\s*Social[:\s]+([^\n\r|/0-9][^|/\n\r]{3,80}?)(?:\s{2,}|\t|CNPJ|Per[ií]odo)/i,
    /Nome\s*Empresarial[:\s]+([^\n\r|/0-9][^|/\n\r]{3,80}?)(?:\s{2,}|\t|CNPJ)/i,
    /Contribuinte[:\s]+([^\n\r|/0-9][^|/\n\r]{3,80}?)(?:\s{2,}|\t|CNPJ)/i,
  ]) ?? "Empresa sem nome";

  // ── Período de Apuração (PA) ──────────────────────────────────────────────
  const paRaw = firstMatch(norm, [
    /Per[ií]odo\s*de\s*Apura[cç][ãa]o[:\s]*(\d{2}\/\d{4})/i,
    /PA[:\s]*(\d{2}\/\d{4})/i,
    /Apura[cç][ãa]o[:\s]*(\d{2}\/\d{4})/i,
    /(\d{2}\/20\d{2})/,  // fallback: any MM/YYYY
  ]);
  const pa = paRaw ? paToYM(paRaw) : null;
  if (!pa) return { erro: `Não foi possível identificar o Período de Apuração no arquivo "${file.name}".` };

  // ── Receita Bruta do Período ──────────────────────────────────────────────
  const recBrutaRaw = firstMatch(norm, [
    // "Receita Bruta do Período de Apuração ... R$ X"
    /Receita\s*Bruta\s*do\s*Per[ií]odo[^R\n]*R\$\s*([\d.,]+)/i,
    // "Receita Bruta Tributada pelo Simples Nacional R$ X"
    /Receita\s*Bruta\s*Tribut[a-z]*[^R\n]*R\$\s*([\d.,]+)/i,
    // "Receita Bruta (Mensal) ... valor"
    /Receita\s*Bruta\s*[(\[]?\s*[Mm]ensal[)\]]?[^R\n]*R?\$?\s*([\d.,]+)/i,
    // Tabular: label em uma linha, valor na próxima — tentar com allLines
    /Receita\s*Bruta\s*do\s*Per[ií]odo[:\s]+([\d.,]+)/i,
  ]);
  const receitaBruta = parseBRL(recBrutaRaw);

  // ── RBT12 ─────────────────────────────────────────────────────────────────
  const rbt12Raw = firstMatch(norm, [
    /RBT12[^R\n]*R\$\s*([\d.,]+)/i,
    /Receita\s*Bruta\s*(?:dos\s*|dos\s+[UÚ]ltimos\s*)?12[^R\n]*R\$\s*([\d.,]+)/i,
    /12\s*(?:\(doze\)\s*)?[Mm]eses?[^R\n]*R\$\s*([\d.,]+)/i,
    /Receita\s*Bruta\s*Acumulada[^R\n]*R\$\s*([\d.,]+)/i,
    /RBT\s*12[:\s]+([\d.,]+)/i,
  ]);
  const rbt12 = parseBRL(rbt12Raw);

  // ── DAS ───────────────────────────────────────────────────────────────────
  const dasRaw = firstMatch(norm, [
    /(?:Valor\s+do\s+DAS|DAS\s+a\s+Pagar|Total\s+DAS)[^R\n]*R\$\s*([\d.,]+)/i,
    /DAS[^-–R\n]*[-–][^R\n]*R\$\s*([\d.,]+)/i,
    /(?:Simples\s*Nacional\s*[-–]\s*DAS|DAS\s*[-–]\s*Simples)[^R\n]*R\$\s*([\d.,]+)/i,
    /Valor\s*do\s*Documento[^R\n]*R\$\s*([\d.,]+)/i,
    /Total\s*a\s*Pagar[^R\n]*R\$\s*([\d.,]+)/i,
  ]);
  const das = parseBRL(dasRaw);

  // ── Alíquota efetiva ──────────────────────────────────────────────────────
  const aliqRaw = firstMatch(norm, [
    /Al[ií]quota\s*[Ee]fetiva[:\s]*([\d,.]+)\s*%/i,
    /Al[ií]quota\s*Aplic[a-z]*[:\s]*([\d,.]+)\s*%/i,
  ]);
  const aliqEfetiva = parsePct(aliqRaw);

  // ── Fator R ───────────────────────────────────────────────────────────────
  const fatorRRaw = firstMatch(norm, [
    /Fator\s*R[:\s]*([\d,.]+)\s*%/i,
    /FS12\s*\/\s*RBT12[:\s]*([\d,.]+)\s*%/i,
  ]);
  const fatorR = parsePct(fatorRRaw);

  // ── Folha de Salários (para Fator R) ─────────────────────────────────────
  const folhaRaw = firstMatch(norm, [
    /Folha[^R\n]*12[^R\n]*R\$\s*([\d.,]+)/i,
    /FS12[^R\n]*R\$\s*([\d.,]+)/i,
    /Sal[aá]rios?[^R\n]*12[^R\n]*R\$\s*([\d.,]+)/i,
  ]);
  const folha12 = parseBRL(folhaRaw);

  // ── Tributos (para inferir Anexo) ─────────────────────────────────────────
  const tributos = extrairTributos(norm);

  // ── Anexo ─────────────────────────────────────────────────────────────────
  const anexo = inferirAnexo(norm, tributos);

  return {
    arquivo: file.name,
    cnpj,
    nome:     nome.replace(/\s+/g, " ").trim().slice(0, 100),
    pa,       // "AAAA-MM"
    receitaBruta,
    rbt12,
    das,
    aliqEfetiva,
    fatorR,   // em %
    folha12,
    anexo,
    tributos,
    // Flags de qualidade
    confiancaCNPJ:    !!cnpj,
    confiancaReceita: receitaBruta > 0,
    confiancaRbt12:   rbt12 > 0,
    confiancaAnexo:   /Tabela|Anexo/i.test(norm),
  };
}

// ── Agrupa registros de múltiplos PDFs por CNPJ ───────────────────────────────
// Retorna Map<cnpj, { nome, cnpj, meses: [...], rbt12Ultimo, folha12Ultimo, anexo, fatorR }>
export function agruparPorEmpresa(registros) {
  const map = new Map();

  for (const r of registros) {
    if (r.erro) continue;
    const key = r.cnpj || r.nome; // fallback para nome se CNPJ não detectado

    if (!map.has(key)) {
      map.set(key, {
        cnpj:       r.cnpj,
        nome:       r.nome,
        anexo:      r.anexo,
        fatorR:     r.fatorR > 0,
        folha12:    r.folha12,
        meses:      [],
        rbt12Ultimo:     0,
        dasUltimo:       0,
        aliqUltima:      0,
        arquivos:        [],
        confiancaAnexo:  r.confiancaAnexo,
      });
    }

    const emp = map.get(key);
    // Atualiza nome com o mais recente (pode ter variações)
    if (r.nome && r.nome.length > 3) emp.nome = r.nome;
    // Mantém o Anexo se detectado com confiança
    if (r.confiancaAnexo) { emp.anexo = r.anexo; emp.confiancaAnexo = true; }
    if (r.folha12 > 0)    emp.folha12 = r.folha12;
    if (r.rbt12 > 0)      emp.rbt12Ultimo = r.rbt12;
    if (r.das > 0)        emp.dasUltimo = r.das;
    if (r.aliqEfetiva > 0) emp.aliqUltima = r.aliqEfetiva;

    // Não duplicar o mesmo mês (pode vir de retificação)
    const jaExiste = emp.meses.some(m => m.mes === r.pa);
    if (!jaExiste && r.pa) {
      emp.meses.push({
        mes: r.pa,
        faturamento: r.receitaBruta,
        das_pgdas: r.das,
        aliq_pgdas: r.aliqEfetiva,
      });
    }
    emp.arquivos.push(r.arquivo);
  }

  // Ordena meses cronologicamente
  for (const emp of map.values()) {
    emp.meses.sort((a, b) => a.mes.localeCompare(b.mes));
  }

  return map;
}
