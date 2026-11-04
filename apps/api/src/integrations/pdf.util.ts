import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Gera um PDF simples (A4) com título e linhas — guias simuladas, relatórios e Checkup 360. */
export async function simplePdf(title: string, lines: (string | [string, string])[], footer?: string, opts: { logo?: Buffer | null } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  // Logo do escritório no canto superior direito (PNG ou JPG)
  const kind = opts.logo ? imageKind(opts.logo) : null;
  if (opts.logo && kind) {
    try {
      const img = kind === 'png' ? await doc.embedPng(opts.logo) : await doc.embedJpg(opts.logo);
      const scale = Math.min(140 / img.width, 48 / img.height, 1);
      page.drawImage(img, { x: 547 - img.width * scale, y: 818 - img.height * scale, width: img.width * scale, height: img.height * scale });
      y = Math.min(y, 818 - img.height * scale - 22);
    } catch { /* imagem inválida: segue sem logo */ }
  }
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
  return s.replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ]/g, '');
}

/** Identifica PNG/JPEG pelos bytes iniciais (não confia na extensão). */
export function imageKind(b: Buffer): 'png' | 'jpg' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}
