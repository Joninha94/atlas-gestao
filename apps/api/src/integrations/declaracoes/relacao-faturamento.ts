import { CFC_LOGO_PNG } from './assets';
import { A4, COR, Contexto, DadosEscritorio, LARGURA, MARGEM, brl, caixa, fmtCep, fmtCnpj, limpa, linhaTabela, novaDeclaracao, novaPagina, numerarPaginas, texto } from './papel-timbrado';

/**
 * Relação de Faturamento Pessoa Jurídica — segue o modelo do escritório:
 * dados da empresa, 12 meses (mercadorias/serviços), totais, % e média, legenda, local/data,
 * assinaturas do contador responsável e do representante da empresa, dados do escritório e marca do CFC.
 */
export interface DadosRelacaoFaturamento {
  empresa: {
    legalName: string; document: string; stateRegistration?: string | null;
    street?: string | null; district?: string | null; city?: string | null; uf?: string | null; zipCode?: string | null;
    legalRepName?: string | null; regime: string;
  };
  meses: { competence: string; valor: number }[]; // 'AAAA-MM', em ordem
  emitidoEm?: Date;
}

const REGIME: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional', MEI: 'MEI', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real',
  IMUNE_ISENTA: 'Imune/Isenta', PESSOA_FISICA: 'Pessoa Física',
};
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataPorExtenso(d: Date) {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', day: '2-digit', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('day')} de ${MESES[Number(get('month')) - 1]} de ${get('year')}`;
}

export async function relacaoFaturamentoPdf(escritorio: DadosEscritorio, logo: Buffer | null, dados: DadosRelacaoFaturamento): Promise<Buffer> {
  const ctx = await novaDeclaracao(escritorio, logo);
  const { page } = novaPagina(ctx);
  let y = A4.h - 124;
  const e = dados.empresa;

  // ---- Dados da Empresa
  const hBar = 16;
  caixa(page, MARGEM, y - hBar, LARGURA, hBar, { fundo: COR.marca, borda: COR.marca });
  texto(page, 'Dados da Empresa', MARGEM, y - hBar + 4.5, LARGURA, { font: ctx.bold, size: 9.5, cor: COR.branco });
  const hBox = 66;
  caixa(page, MARGEM, y - hBar - hBox, LARGURA, hBox);
  let yy = y - hBar - 15;
  texto(page, e.legalName, MARGEM, yy, LARGURA, { font: ctx.bold, size: 11 });
  yy -= 14;
  texto(page, [e.street, e.district].filter(Boolean).join(' - ') || 'Endereço não informado', MARGEM, yy, LARGURA, { font: ctx.font, size: 8.5 });
  yy -= 13;
  const metade = LARGURA * 0.6;
  texto(page, [e.city, e.uf].filter(Boolean).join(' - ').toUpperCase(), MARGEM, yy, metade, { font: ctx.font, size: 8.5 });
  rotulo(ctx, page, 'CEP: ', fmtCep(e.zipCode), MARGEM + metade, yy);
  yy -= 13;
  rotulo(ctx, page, 'CNPJ: ', fmtCnpj(e.document), MARGEM, yy);
  rotulo(ctx, page, 'IE: ', e.stateRegistration ?? '', MARGEM + metade, yy);
  y = y - hBar - hBox - 22;

  // ---- Título
  const titulo = 'RELAÇÃO DE FATURAMENTO PESSOA JURÍDICA';
  page.drawText(limpa(titulo), { x: (A4.w - ctx.bold.widthOfTextAtSize(titulo, 12)) / 2, y, size: 12, font: ctx.bold, color: COR.marca });
  y -= 14;

  // ---- Tabela de meses
  const col = [88, 197.28, 198];
  const al: ('esq' | 'centro' | 'dir')[] = ['centro', 'dir', 'dir'];
  y = linhaTabela(page, ctx, y, col, ['PERÍODO', 'MERCADORIAS / SERVIÇOS', 'TOTAL GERAL'], { altura: 20, fundo: COR.marca, corTexto: COR.branco, negrito: true, alinhar: ['centro', 'centro', 'centro'] });
  const total = dados.meses.reduce((s, m) => s + m.valor, 0);
  dados.meses.forEach((m, i) => {
    const per = `${m.competence.slice(5, 7)}/${m.competence.slice(0, 4)}`;
    y = linhaTabela(page, ctx, y, col, [per, brl(m.valor), brl(m.valor)], { fundo: i % 2 ? COR.marcaClara : undefined, alinhar: al });
  });
  const pct = total > 0 ? '100,00 %' : '0,00 %';
  const media = dados.meses.length ? total / dados.meses.length : 0;
  y = linhaTabela(page, ctx, y, col, ['TOTAIS', brl(total), brl(total)], { altura: 16, fundo: COR.marca, corTexto: COR.branco, negrito: true, alinhar: al });
  y = linhaTabela(page, ctx, y, col, ['%', pct, pct], { altura: 16, negrito: true, alinhar: al });
  y = linhaTabela(page, ctx, y, col, ['Média', brl(media), brl(media)], { altura: 16, negrito: true, alinhar: al });
  y -= 10;

  // ---- Legenda
  const colL = [160, 85, 120, 118.28];
  y = linhaTabela(page, ctx, y, colL, ['Legenda', 'Percentual', 'Média em R$', 'Regime Tributário'], { altura: 18, fundo: COR.marca, corTexto: COR.branco, negrito: true, alinhar: ['centro', 'centro', 'centro', 'centro'] });
  y = linhaTabela(page, ctx, y, colL, ['MERCADORIAS / SERVIÇOS', pct, brl(media), REGIME[e.regime] ?? e.regime], { alinhar: ['esq', 'centro', 'dir', 'centro'] });
  y -= 22;

  // ---- Local e data
  const local = `${[escritorio.city, escritorio.uf].filter(Boolean).join(' - ').toUpperCase() || 'MACEIÓ - AL'}, ${dataPorExtenso(dados.emitidoEm ?? new Date())}.`;
  page.drawText(limpa(local), { x: (A4.w - ctx.bold.widthOfTextAtSize(limpa(local), 9.5)) / 2, y, size: 9.5, font: ctx.bold, color: COR.texto });
  y -= 52;

  // ---- Assinaturas
  const colW = (LARGURA - 30) / 2;
  const xDir = MARGEM + colW + 30;
  page.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + colW, y }, thickness: 0.7, color: COR.texto });
  page.drawLine({ start: { x: xDir, y }, end: { x: xDir + colW, y }, thickness: 0.7, color: COR.texto });
  let yE = y - 13;
  let yD = y - 13;
  texto(page, (escritorio.accountantName || 'Contador responsável').toUpperCase(), MARGEM, yE, colW, { font: ctx.bold, size: 8.5, alinhar: 'centro' });
  yE -= 12;
  texto(page, `CRC: ${escritorio.accountantCrc ?? ''}`, MARGEM, yE, colW, { font: ctx.bold, size: 8.5, alinhar: 'centro' });
  yE -= 12;
  texto(page, `CPF: ${escritorio.accountantCpf ? fmtCnpj(escritorio.accountantCpf) : ''}`, MARGEM, yE, colW, { font: ctx.bold, size: 8.5, alinhar: 'centro' });
  texto(page, (e.legalRepName || e.legalName).toUpperCase(), xDir, yD, colW, { font: ctx.bold, size: 8.5, alinhar: 'centro' });
  yD -= 12;
  texto(page, `CNPJ: ${fmtCnpj(e.document)}`, xDir, yD, colW, { font: ctx.bold, size: 8.5, alinhar: 'centro' });

  // ---- Dados do escritório (vêm do cadastro do escritório) + marca do CFC
  let yO = yE - 26;
  const of = [
    { t: (escritorio.legalName || escritorio.name).toUpperCase(), b: true },
    { t: [escritorio.street, escritorio.district].filter(Boolean).join(' - ').toUpperCase(), b: false },
    { t: [[escritorio.city, escritorio.uf].filter(Boolean).join(' - '), escritorio.zipCode ? `CEP: ${fmtCep(escritorio.zipCode)}` : ''].filter(Boolean).join(' - ').toUpperCase(), b: false },
    { t: `CNPJ: ${fmtCnpj(escritorio.cnpj)}`, b: false },
  ].filter((l) => l.t.trim());
  for (const l of of) {
    const f = l.b ? ctx.bold : ctx.font;
    const size = l.b ? 8.5 : 8;
    for (const parte of quebrar(limpa(l.t), f, size, colW + 12)) {
      page.drawText(parte, { x: MARGEM, y: yO, size, font: f, color: COR.texto });
      yO -= 11;
    }
  }
  const cfc = await ctx.doc.embedPng(CFC_LOGO_PNG);
  const s = Math.min(130 / cfc.width, 62 / cfc.height);
  page.drawImage(cfc, { x: xDir + (colW - cfc.width * s) / 2, y: yE - 26 - cfc.height * s + 10, width: cfc.width * s, height: cfc.height * s });

  numerarPaginas(ctx);
  return Buffer.from(await ctx.doc.save());
}

function rotulo(ctx: Contexto, page: import('pdf-lib').PDFPage, r: string, v: string, x: number, y: number) {
  page.drawText(limpa(r), { x: x + 4, y, size: 8.5, font: ctx.bold, color: COR.texto });
  page.drawText(limpa(v), { x: x + 4 + ctx.bold.widthOfTextAtSize(limpa(r), 8.5), y, size: 8.5, font: ctx.font, color: COR.texto });
}

/** Quebra o texto em linhas que caibam na largura. */
function quebrar(t: string, font: import('pdf-lib').PDFFont, size: number, w: number) {
  const out: string[] = [];
  let atual = '';
  for (const p of t.split(' ')) {
    const tent = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(tent, size) > w && atual) { out.push(atual); atual = p; } else atual = tent;
  }
  if (atual) out.push(atual);
  return out;
}
