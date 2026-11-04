import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Gera um PDF simples (A4) com título e linhas — guias simuladas, relatórios e Checkup 360. */
export async function simplePdf(title: string, lines: (string | [string, string])[], footer?: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  page.drawText(sanitize(title), { x: 48, y, size: 16, font: bold, color: rgb(0.1, 0.12, 0.2) });
  y -= 30;
  for (const line of lines) {
    if (y < 70) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    if (Array.isArray(line)) {
      page.drawText(sanitize(line[0]), { x: 48, y, size: 10, font: bold });
      page.drawText(sanitize(line[1]), { x: 230, y, size: 10, font });
    } else if (line === '') {
      y -= 6;
      continue;
    } else {
      page.drawText(sanitize(line), { x: 48, y, size: 10, font });
    }
    y -= 16;
  }
  if (footer) page.drawText(sanitize(footer), { x: 48, y: 40, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  return Buffer.from(await doc.save());
}

/** As fontes padrão do PDF usam WinAnsi: mantém acentos do português e remove o resto. */
function sanitize(s: string) {
  return s.replace(/[^\x20-\x7E -ÿ]/g, '');
}
