import { Injectable, Logger } from '@nestjs/common';

// pdf.js é ESM; o `import()` precisa sobreviver à compilação para CommonJS.
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

/**
 * Extrai o texto de PDFs enviados (envio em lote, arrasta-e-solta, anexos) com pdf.js.
 * O texto é usado para achar CPF/CNPJ e classificar o documento. PDFs escaneados (imagem)
 * voltam sem texto: nesses casos o usuário escolhe o cliente manualmente (ou um OCR futuro).
 */
@Injectable()
export class PdfTextService {
  private readonly log = new Logger(PdfTextService.name);

  async extract(buf: Buffer, mime: string): Promise<string> {
    if (!/pdf/i.test(mime)) return mime.startsWith('text/') ? buf.toString('utf8') : '';
    try {
      const pdfjs = await esmImport('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(content.items.map((it: any) => it.str).join(' '));
      }
      await doc.destroy();
      return pages.join('\n').slice(0, 200_000);
    } catch (e) {
      this.log.warn(`Não foi possível ler o PDF: ${(e as Error).message}`);
      return '';
    }
  }
}
