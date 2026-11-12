// Texto de um PDF no navegador (pdf.js), para identificar o cliente pelo
// CPF/CNPJ. Lê só as primeiras páginas: guias e relatórios trazem o
// documento do contribuinte no cabeçalho.
export async function extractPdfText(file, maxPages = 3) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // pdfjs-dist v6 usa ReadableStream[Symbol.asyncIterator], ausente em alguns browsers.
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

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/standard_fonts/",
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const pages = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const parts = content.items.map(item => item.str || "");
    // O pdf.js às vezes quebra um CNPJ em vários itens; a versão sem
    // separador remonta o número, a com espaço preserva limites de palavra.
    pages.push(parts.join(" "), parts.join(""));
  }
  await pdf.destroy();
  return pages.join("\n");
}
