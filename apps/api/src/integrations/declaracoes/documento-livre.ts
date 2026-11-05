import { A4, COR, DadosEscritorio, LARGURA, MARGEM, limpa, novaDeclaracao, novaPagina, numerarPaginas } from './papel-timbrado';
import { dataPorExtenso } from './relacao-faturamento';

/**
 * Documento de texto livre no papel timbrado (Templates de Documentos): título centralizado,
 * parágrafos justificados à esquerda com quebra automática, local/data e assinatura do contador.
 */
export async function documentoLivrePdf(escritorio: DadosEscritorio, logo: Buffer | null, d: { titulo: string; corpo: string; emitidoEm?: Date; assinatura?: boolean }) {
  const ctx = await novaDeclaracao(escritorio, logo);
  let { page, y } = novaPagina(ctx);
  const size = 10.5;
  const lh = 15;
  const bottom = 96;
  const ensure = (h: number) => {
    if (y - h < bottom) ({ page, y } = novaPagina(ctx));
  };

  const t = limpa(d.titulo.toUpperCase());
  const tw = ctx.bold.widthOfTextAtSize(t, 13);
  page.drawText(t, { x: (A4.w - Math.min(tw, LARGURA)) / 2, y: y - 6, size: 13, font: ctx.bold, color: COR.marca });
  y -= 40;

  for (const par of d.corpo.split(/\n/)) {
    if (!par.trim()) { y -= lh * 0.6; continue; }
    const words = limpa(par).split(/\s+/);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.font.widthOfTextAtSize(next, size) > LARGURA && line) {
        ensure(lh);
        page.drawText(line, { x: MARGEM, y, size, font: ctx.font, color: COR.texto });
        y -= lh;
        line = w;
      } else line = next;
    }
    if (line) {
      ensure(lh);
      page.drawText(line, { x: MARGEM, y, size, font: ctx.font, color: COR.texto });
      y -= lh;
    }
    y -= 4;
  }

  const local = limpa(`${escritorio.city ?? 'Maceió'}${escritorio.uf ? `/${escritorio.uf}` : ''}, ${dataPorExtenso(d.emitidoEm ?? new Date())}.`);
  ensure(110);
  y -= 18;
  page.drawText(local, { x: A4.w - MARGEM - ctx.font.widthOfTextAtSize(local, size), y, size, font: ctx.font, color: COR.texto });

  if (d.assinatura !== false && escritorio.accountantName) {
    y -= 64;
    const cx = A4.w / 2;
    page.drawLine({ start: { x: cx - 120, y }, end: { x: cx + 120, y }, thickness: 0.6, color: COR.texto });
    const linhas = [escritorio.accountantName, 'Contador(a) responsável', escritorio.accountantCrc ? `CRC ${escritorio.accountantCrc}` : ''].filter(Boolean).map(limpa);
    linhas.forEach((l, i) => {
      const f = i === 0 ? ctx.bold : ctx.font;
      page.drawText(l, { x: cx - f.widthOfTextAtSize(l, 9) / 2, y: y - 12 - i * 11, size: 9, font: f, color: COR.texto });
    });
  }
  numerarPaginas(ctx);
  return Buffer.from(await ctx.doc.save());
}
