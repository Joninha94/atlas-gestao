import { PDFDocument, PDFFont, PDFImage, PDFPage, RGB, StandardFonts, rgb } from 'pdf-lib';
import { imageKind } from '../pdf.util';

/**
 * Papel timbrado do escritório + primitivas de desenho para declarações em PDF.
 * Toda declaração (Relação de Faturamento e as próximas) usa `novaDeclaracao()` e desenha só o conteúdo.
 */

export interface DadosEscritorio {
  name: string;
  legalName?: string | null;
  cnpj: string;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  uf?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  website?: string | null;
  accountantName?: string | null;
  accountantCrc?: string | null;
  accountantCpf?: string | null;
}

export const COR = {
  marca: rgb(0.235, 0.325, 0.667), // azul da marca
  marcaClara: rgb(0.93, 0.95, 0.99),
  texto: rgb(0.13, 0.15, 0.2),
  suave: rgb(0.4, 0.43, 0.5),
  linha: rgb(0.55, 0.6, 0.7),
  branco: rgb(1, 1, 1),
};

export const A4 = { w: 595.28, h: 841.89 };
export const MARGEM = 56;
export const LARGURA = A4.w - MARGEM * 2;

export interface Contexto {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  logo: PDFImage | null;
  escritorio: DadosEscritorio;
  paginas: PDFPage[];
}

export const fmtCnpj = (d: string) => {
  const v = (d ?? '').replace(/\D/g, '');
  if (v.length === 14) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (v.length === 11) return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d ?? '';
};
export const fmtCep = (c?: string | null) => {
  const v = (c ?? '').replace(/\D/g, '');
  return v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
};
export const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Fontes padrão do PDF usam WinAnsi: mantém acentos do português e troca o resto. */
export function limpa(s: string) {
  return String(s ?? '').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ]/g, '');
}

export async function novaDeclaracao(escritorio: DadosEscritorio, logoBytes?: Buffer | null): Promise<Contexto> {
  const doc = await PDFDocument.create();
  const kind = logoBytes ? imageKind(logoBytes) : null;
  let logo: PDFImage | null = null;
  if (logoBytes && kind) {
    try { logo = kind === 'png' ? await doc.embedPng(logoBytes) : await doc.embedJpg(logoBytes); } catch { logo = null; }
  }
  return {
    doc, logo, escritorio, paginas: [],
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
}

/** Nova página com cabeçalho e rodapé do papel timbrado. Retorna o Y onde o conteúdo começa. */
export function novaPagina(ctx: Contexto): { page: PDFPage; y: number } {
  const page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.paginas.push(page);
  const e = ctx.escritorio;
  const razao = limpa((e.legalName || e.name).toUpperCase());

  // Cabeçalho: logo à esquerda, razão social e CNPJ ao lado
  let textoX = MARGEM;
  if (ctx.logo) {
    const s = Math.min(110 / ctx.logo.width, 52 / ctx.logo.height);
    page.drawImage(ctx.logo, { x: MARGEM, y: A4.h - 40 - ctx.logo.height * s, width: ctx.logo.width * s, height: ctx.logo.height * s });
    textoX = MARGEM + ctx.logo.width * s + 14;
  }
  page.drawText(razao, { x: textoX, y: A4.h - 58, size: 12, font: ctx.font, color: COR.texto });
  page.drawText(`CNPJ: ${fmtCnpj(e.cnpj)}`, { x: textoX + 40, y: A4.h - 72, size: 9, font: ctx.mono, color: COR.texto });
  page.drawLine({ start: { x: MARGEM, y: A4.h - 104 }, end: { x: A4.w - MARGEM, y: A4.h - 104 }, thickness: 0.8, color: COR.marca });

  // Rodapé: endereço, contato e site centralizados
  const linhas = [
    [e.street, e.district, [e.city, e.uf].filter(Boolean).join(' - '), e.zipCode ? `CEP ${fmtCep(e.zipCode)}` : ''].filter((x) => x && String(x).trim()).join(', '),
    e.phone ? `Contato: ${e.phone}` : '',
    e.website ?? '',
  ].filter(Boolean).map(limpa);
  page.drawLine({ start: { x: MARGEM, y: 66 }, end: { x: A4.w - MARGEM, y: 66 }, thickness: 0.5, color: COR.linha });
  linhas.forEach((l, i) => {
    const w = ctx.font.widthOfTextAtSize(l, 8);
    page.drawText(l, { x: (A4.w - w) / 2, y: 54 - i * 10, size: 8, font: ctx.font, color: COR.suave });
  });
  return { page, y: A4.h - 128 };
}

/** Numera as páginas ("Pág.: 1/2") depois que o documento está completo. */
export function numerarPaginas(ctx: Contexto) {
  ctx.paginas.forEach((p, i) => {
    const t = `Pág.: ${i + 1}${ctx.paginas.length > 1 ? `/${ctx.paginas.length}` : ''}`;
    p.drawText(t, { x: A4.w - MARGEM - ctx.font.widthOfTextAtSize(t, 7), y: 24, size: 7, font: ctx.font, color: COR.suave });
  });
}

// ---------------------------------------------------------------------------- primitivas
export type Alinhamento = 'esq' | 'centro' | 'dir';

export function texto(page: PDFPage, s: string, x: number, y: number, w: number, o: { font: PDFFont; size?: number; cor?: RGB; alinhar?: Alinhamento }) {
  const size = o.size ?? 9;
  let t = limpa(s);
  while (t.length > 1 && o.font.widthOfTextAtSize(t, size) > w - 6) t = t.slice(0, -1);
  const tw = o.font.widthOfTextAtSize(t, size);
  const tx = o.alinhar === 'centro' ? x + (w - tw) / 2 : o.alinhar === 'dir' ? x + w - tw - 4 : x + 4;
  page.drawText(t, { x: tx, y, size, font: o.font, color: o.cor ?? COR.texto });
}

export function caixa(page: PDFPage, x: number, y: number, w: number, h: number, o: { fundo?: RGB; borda?: RGB; espessura?: number } = {}) {
  page.drawRectangle({ x, y, width: w, height: h, color: o.fundo, borderColor: o.borda ?? COR.linha, borderWidth: o.espessura ?? 0.6 });
}

/** Linha de tabela: células com larguras fixas. Retorna o novo Y. */
export function linhaTabela(
  page: PDFPage, ctx: Contexto, y: number, larguras: number[], valores: string[],
  o: { altura?: number; fundo?: RGB; corTexto?: RGB; negrito?: boolean; size?: number; alinhar?: Alinhamento[] } = {},
) {
  const h = o.altura ?? 15;
  let x = MARGEM;
  larguras.forEach((w, i) => {
    caixa(page, x, y - h, w, h, { fundo: o.fundo });
    texto(page, valores[i] ?? '', x, y - h + (h - (o.size ?? 8.5)) / 2 + 1.5, w, { font: o.negrito ? ctx.bold : ctx.font, size: o.size ?? 8.5, cor: o.corTexto, alinhar: o.alinhar?.[i] ?? 'esq' });
    x += w;
  });
  return y - h;
}
