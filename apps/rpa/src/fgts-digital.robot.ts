/**
 * Robô do FGTS Digital (Playwright). Implementa FgtsDigitalPort da API.
 * Roda em imagem própria (mcr.microsoft.com/playwright) consumindo a fila "rpa".
 *
 * Login com certificado: o Playwright aceita certificado de cliente por origem
 * (`clientCertificates` no contexto). O escritório acessa como procurador do cliente.
 *
 * Os SELETORES ficam todos em SELECTORS para ajuste rápido quando o portal mudar.
 * Antes de produção: mapear cada tela no portal real e registrar testes com gravação.
 */
import { chromium, type BrowserContext } from 'playwright';

export const PORTAL = process.env.FGTS_DIGITAL_URL ?? 'https://fgtsdigital.sistema.gov.br';

export const SELECTORS = {
  loginCertificado: 'text=Certificado digital',
  trocarPerfil: 'text=Trocar perfil',
  campoProcurador: '[data-testid="cnpj-representado"]',
  menuGuias: 'text=Gestão de Guias',
  emitirGuiaRapida: 'text=Emissão de Guia Rápida',
  tabelaGuias: 'table',
  menuEmpregados: 'text=Consultas',
  caixaPostal: 'text=Caixa Postal',
} as const;

export async function openContext(pfx: Buffer, passphrase: string): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: true });
  return browser.newContext({
    clientCertificates: [{ origin: PORTAL, pfx, passphrase }],
    locale: 'pt-BR',
    timezoneId: 'America/Maceio',
  });
}

export async function selectRepresented(ctx: BrowserContext, cnpj: string) {
  const page = await ctx.newPage();
  await page.goto(PORTAL);
  await page.click(SELECTORS.loginCertificado);
  await page.click(SELECTORS.trocarPerfil);
  await page.fill(SELECTORS.campoProcurador, cnpj);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
  return page;
}

/**
 * Esqueleto da captura de guias. Cada etapa precisa ser validada no portal real;
 * o retorno segue o contrato FgtsGuide (apps/api/src/integrations/rpa/ports.ts).
 */
export async function listGuides(pfx: Buffer, passphrase: string, cnpj: string, competence: string) {
  const ctx = await openContext(pfx, passphrase);
  try {
    const page = await selectRepresented(ctx, cnpj);
    await page.click(SELECTORS.menuGuias);
    await page.click(SELECTORS.emitirGuiaRapida);
    // TODO(mapear): filtrar competência, ler a tabela, baixar o PDF de cada guia
    // (mensal, rescisória, mista com consignado) e extrair principal, multa, juros e PIX.
    return { ok: true, data: [] as unknown[], competence };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await ctx.browser()?.close();
  }
}
