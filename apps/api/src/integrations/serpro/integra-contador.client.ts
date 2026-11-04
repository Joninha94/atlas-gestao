import { Injectable, Logger } from '@nestjs/common';
import { Agent, request } from 'undici';
import { isSandbox } from '../sandbox';
import { serproSandbox } from './serpro.sandbox';

/**
 * Cliente do SERPRO Integra Contador (canal oficial da Receita para escritórios).
 *
 * Fluxo:
 * 1) Autenticação OAuth2 com mTLS usando o e-CNPJ do ESCRITÓRIO (contratante) + consumer key/secret
 *    da Loja Serpro → recebe `access_token` e `jwt_token`.
 * 2) Cada chamada informa contratante (escritório), autorPedidoDados (escritório, como procurador)
 *    e contribuinte (cliente). Exige procuração eletrônica válida no e-CAC.
 * 3) Endpoints por tipo de operação: Apoiar, Consultar, Declarar, Emitir, Monitorar.
 *
 * Os códigos idSistema/idServico abaixo DEVEM ser conferidos no catálogo vigente da Loja Serpro
 * antes de ir a produção — o catálogo cresce e muda de versão.
 */

export type Operation = 'Apoiar' | 'Consultar' | 'Declarar' | 'Emitir' | 'Monitorar';

export interface ServiceRef {
  operation: Operation;
  idSistema: string;
  idServico: string;
  versaoSistema: string;
}

/** Catálogo usado pelo Monitor. Conferir versões no catálogo da Loja Serpro. */
export const SERPRO_SERVICES = {
  PGDASD_GERAR_DAS: { operation: 'Emitir', idSistema: 'PGDASD', idServico: 'GERARDAS12', versaoSistema: '1.0' },
  PGDASD_CONSULTAR_DECLARACOES: { operation: 'Consultar', idSistema: 'PGDASD', idServico: 'CONSDECLARACAO13', versaoSistema: '1.0' },
  PGDASD_ULTIMA_DECLARACAO: { operation: 'Consultar', idSistema: 'PGDASD', idServico: 'CONSULTIMADECREC14', versaoSistema: '1.0' },
  PGDASD_EXTRATO_DAS: { operation: 'Consultar', idSistema: 'PGDASD', idServico: 'CONSEXTRATO16', versaoSistema: '1.0' },
  PGMEI_GERAR_DAS_PDF: { operation: 'Emitir', idSistema: 'PGMEI', idServico: 'GERARDASPDF21', versaoSistema: '1.0' },
  PGMEI_DIVIDA_ATIVA: { operation: 'Consultar', idSistema: 'PGMEI', idServico: 'DIVIDAATIVA24', versaoSistema: '1.0' },
  DCTFWEB_GERAR_GUIA: { operation: 'Emitir', idSistema: 'DCTFWEB', idServico: 'GERARGUIA31', versaoSistema: '1.0' },
  DCTFWEB_CONSULTAR_RECIBO: { operation: 'Consultar', idSistema: 'DCTFWEB', idServico: 'CONSRECIBO32', versaoSistema: '1.0' },
  DCTFWEB_TRANSMITIR: { operation: 'Declarar', idSistema: 'DCTFWEB', idServico: 'TRANSDECLARACAO38', versaoSistema: '1.0' },
  SICALC_CONSOLIDAR_DARF: { operation: 'Emitir', idSistema: 'SICALC', idServico: 'CONSOLIDARGERARDARF51', versaoSistema: '2.9' },
  PAGTOWEB_CONSULTAR: { operation: 'Consultar', idSistema: 'PAGTOWEB', idServico: 'PAGAMENTOS71', versaoSistema: '1.0' },
  PAGTOWEB_COMPROVANTE: { operation: 'Emitir', idSistema: 'PAGTOWEB', idServico: 'COMPARRECADACAO72', versaoSistema: '1.0' },
  CAIXAPOSTAL_LISTAR: { operation: 'Consultar', idSistema: 'CAIXAPOSTAL', idServico: 'MSGCONTRIBUINTE61', versaoSistema: '1.0' },
  CAIXAPOSTAL_DETALHE: { operation: 'Consultar', idSistema: 'CAIXAPOSTAL', idServico: 'MSGDETALHAMENTO62', versaoSistema: '1.0' },
  CAIXAPOSTAL_INDICADOR: { operation: 'Monitorar', idSistema: 'CAIXAPOSTAL', idServico: 'INNOVAMSG63', versaoSistema: '1.0' },
  PROCURACOES_OBTER: { operation: 'Consultar', idSistema: 'PROCURACOES', idServico: 'OBTERPROCURACAO41', versaoSistema: '1' },
  SITFIS_SOLICITAR: { operation: 'Apoiar', idSistema: 'SITFIS', idServico: 'SOLICITARPROTOCOLO91', versaoSistema: '2.0' },
  SITFIS_RELATORIO: { operation: 'Emitir', idSistema: 'SITFIS', idServico: 'RELATORIOSITFIS92', versaoSistema: '2.0' },
  // Parcelamentos: códigos a confirmar no catálogo (serviços adicionados após o lançamento).
  PARCSN_PEDIDOS: { operation: 'Consultar', idSistema: 'PARCSN', idServico: 'PEDIDOSPARC163', versaoSistema: '1.0' },
  PARCSN_EMITIR_PARCELA: { operation: 'Emitir', idSistema: 'PARCSN', idServico: 'GERARDAS161', versaoSistema: '1.0' },
  PARCMEI_EMITIR_PARCELA: { operation: 'Emitir', idSistema: 'PARCMEI', idServico: 'GERARDAS201', versaoSistema: '1.0' },
} satisfies Record<string, ServiceRef>;

export interface Party {
  numero: string; // CNPJ/CPF só dígitos
  tipo: 1 | 2; // 1 = CPF, 2 = CNPJ
}

export interface IntegraResponse<T = unknown> {
  status: number;
  mensagens: { codigo: string; texto: string }[];
  dados: T;
}

export class IntegraContadorError extends Error {
  constructor(message: string, readonly status: number, readonly mensagens: unknown) {
    super(message);
  }
}

@Injectable()
export class IntegraContadorClient {
  private readonly log = new Logger(IntegraContadorClient.name);
  /** Um token por escritório (CNPJ contratante) — o sistema é multi-escritório. */
  private readonly tokens = new Map<string, { access: string; jwt: string; expiresAt: number }>();

  private readonly authUrl = process.env.SERPRO_AUTH_URL ?? 'https://autenticacao.sapi.serpro.gov.br/authenticate';
  private readonly baseUrl = process.env.SERPRO_BASE_URL ?? 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1';

  private async authenticate(officeCnpj: string, officeCert: { pfx: Buffer; passphrase: string }) {
    const cached = this.tokens.get(officeCnpj);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached;
    const basic = Buffer.from(`${process.env.SERPRO_CONSUMER_KEY}:${process.env.SERPRO_CONSUMER_SECRET}`).toString('base64');
    const dispatcher = new Agent({ connect: { pfx: officeCert.pfx, passphrase: officeCert.passphrase } });
    const res = await request(this.authUrl, {
      method: 'POST',
      dispatcher,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Role-Type': 'TERCEIROS',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await res.body.json()) as { access_token: string; jwt_token: string; expires_in: number };
    if (res.statusCode !== 200) throw new IntegraContadorError('Falha na autenticação SERPRO', res.statusCode, body);
    const token = { access: body.access_token, jwt: body.jwt_token, expiresAt: Date.now() + body.expires_in * 1000 };
    this.tokens.set(officeCnpj, token);
    return token;
  }

  async call<T = unknown>(
    officeCert: { pfx: Buffer; passphrase: string },
    service: ServiceRef,
    office: Party,
    taxpayer: Party,
    dados: Record<string, unknown> = {},
  ): Promise<IntegraResponse<T>> {
    if (isSandbox()) return serproSandbox<T>(service, taxpayer, dados as Record<string, any>);
    const tk = await this.authenticate(office.numero, officeCert);
    const payload = {
      contratante: office,
      autorPedidoDados: office,
      contribuinte: taxpayer,
      pedidoDados: {
        idSistema: service.idSistema,
        idServico: service.idServico,
        versaoSistema: service.versaoSistema,
        dados: JSON.stringify(dados),
      },
    };
    const res = await request(`${this.baseUrl}/${service.operation}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk.access}`, jwt_token: tk.jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.body.json()) as IntegraResponse<string>;
    if (res.statusCode >= 400) {
      this.log.warn(`SERPRO ${service.idServico} → ${res.statusCode}`);
      throw new IntegraContadorError(`Erro ${service.idServico}`, res.statusCode, body.mensagens);
    }
    // `dados` vem como string JSON
    const parsed = typeof body.dados === 'string' && body.dados ? JSON.parse(body.dados) : body.dados;
    return { ...body, dados: parsed as T };
  }
}
