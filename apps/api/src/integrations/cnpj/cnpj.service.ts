import { BadRequestException, Controller, Get, HttpException, Injectable, Logger, NotFoundException, Param } from '@nestjs/common';
import { request } from 'undici';
import { DadosCnpj, fromCnpjWs, isValidCnpj, onlyDigits } from '@produtiva/core';
import { isSandbox } from '../sandbox';

/** Dados de cadastro + JSON bruto da consulta. */
export interface CnpjData extends DadosCnpj {
  raw: unknown;
  fonte: 'cnpj.ws' | 'brasilapi' | 'simulado';
}

const CITIES = [
  { uf: 'AL', city: 'Maceió', ibge: 2704302 },
  { uf: 'AL', city: 'Arapiraca', ibge: 2700300 },
  { uf: 'PE', city: 'Recife', ibge: 2611606 },
  { uf: 'SE', city: 'Aracaju', ibge: 2800308 },
  { uf: 'BA', city: 'Salvador', ibge: 2927408 },
  { uf: 'SP', city: 'São Paulo', ibge: 3550308 },
];

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cadastro automático pelo CNPJ.
 * Fonte principal: API pública CNPJ.ws (https://publica.cnpj.ws) — limite de 3 consultas/minuto por IP.
 * Reserva: BrasilAPI. No modo sandbox, se nenhuma responder (sem internet, limite atingido ou CNPJ de teste),
 * devolve dados fictícios no mesmo formato da CNPJ.ws.
 * As respostas ficam 24 h em cache para não gastar o limite (consultar e depois cadastrar = 1 consulta).
 */
@Injectable()
export class CnpjService {
  private readonly log = new Logger(CnpjService.name);
  private readonly cache = new Map<string, { at: number; data: CnpjData }>();

  async lookup(cnpj: string): Promise<CnpjData> {
    const doc = onlyDigits(cnpj);
    if (!isValidCnpj(doc)) throw new BadRequestException('CNPJ inválido: confira os dígitos verificadores.');
    const hit = this.cache.get(doc);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

    let data: CnpjData | null = null;
    try {
      data = await this.cnpjWs(doc);
    } catch (e) {
      if (!isSandbox() && (e instanceof NotFoundException || (e instanceof HttpException && e.getStatus() === 429))) throw e;
      this.log.warn(`CNPJ.ws indisponível para ${doc}: ${(e as Error).message}`);
    }
    if (!data && !isSandbox()) {
      data = await this.brasilApi(doc).catch((e) => {
        throw e instanceof HttpException ? e : new HttpException('Consulta de CNPJ indisponível no momento. Tente de novo em instantes.', 503);
      });
    }
    if (!data) data = this.simulado(doc);
    if (data.fonte !== 'simulado') {
      this.cache.set(doc, { at: Date.now(), data });
      if (this.cache.size > 2000) this.cache.delete(this.cache.keys().next().value!);
    }
    return data;
  }

  private async cnpjWs(doc: string): Promise<CnpjData> {
    const res = await request(`https://publica.cnpj.ws/cnpj/${doc}`, { headersTimeout: 6000, bodyTimeout: 8000, headers: { accept: 'application/json' } });
    const body = (await res.body.json().catch(() => ({}))) as any;
    if (res.statusCode === 200) return { ...fromCnpjWs(body), raw: body, fonte: 'cnpj.ws' };
    if (res.statusCode === 404) throw new NotFoundException('CNPJ não encontrado na base da Receita Federal.');
    if (res.statusCode === 429) throw new HttpException(body?.detalhes ?? 'Limite da consulta pública atingido (3 por minuto). Aguarde um minuto e tente de novo.', 429);
    if (res.statusCode === 400) throw new BadRequestException(body?.detalhes ?? 'CNPJ inválido.');
    throw new Error(`CNPJ.ws respondeu ${res.statusCode}`);
  }

  private async brasilApi(doc: string): Promise<CnpjData> {
    const res = await request(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, { headersTimeout: 6000, bodyTimeout: 8000 });
    if (res.statusCode === 404) throw new NotFoundException('CNPJ não encontrado na base da Receita Federal.');
    if (res.statusCode !== 200) throw new Error(`BrasilAPI respondeu ${res.statusCode}`);
    const d = (await res.body.json()) as Record<string, any>;
    // Converte para o formato da CNPJ.ws e reaproveita o mesmo mapeamento
    const asWs = {
      razao_social: d.razao_social, capital_social: d.capital_social,
      natureza_juridica: { id: String(d.codigo_natureza_juridica ?? ''), descricao: d.natureza_juridica },
      porte: { descricao: d.porte }, simples: { simples: d.opcao_pelo_simples ? 'Sim' : 'Não', mei: d.opcao_pelo_mei ? 'Sim' : 'Não' },
      socios: (d.qsa ?? []).map((p: any) => ({ nome: p.nome_socio, qualificacao_socio: { descricao: p.qualificacao_socio } })),
      estabelecimento: {
        cnpj: doc, nome_fantasia: d.nome_fantasia, situacao_cadastral: d.descricao_situacao_cadastral,
        tipo_logradouro: d.descricao_tipo_de_logradouro, logradouro: d.logradouro, numero: d.numero, complemento: d.complemento,
        bairro: d.bairro, cep: d.cep, email: d.email, data_inicio_atividade: d.data_inicio_atividade,
        ddd1: String(d.ddd_telefone_1 ?? '').slice(0, 2), telefone1: String(d.ddd_telefone_1 ?? '').slice(2),
        atividade_principal: { id: String(d.cnae_fiscal ?? ''), descricao: d.cnae_fiscal_descricao },
        cidade: { nome: d.municipio, ibge_id: d.codigo_municipio_ibge }, estado: { sigla: d.uf }, inscricoes_estaduais: [],
      },
    };
    return { ...fromCnpjWs(asWs), raw: d, fonte: 'brasilapi' };
  }

  /** Dados fictícios (modo sandbox), no mesmo formato da CNPJ.ws, para testar sem internet. */
  private simulado(doc: string): CnpjData {
    const n = Number(doc.slice(0, 4));
    const c = CITIES[n % CITIES.length];
    const raw = {
      cnpj_raiz: doc.slice(0, 8), razao_social: `Empresa Exemplo ${doc.slice(0, 4)} Ltda`, capital_social: `${10000 + (n % 90) * 1000}.00`,
      porte: { id: '01', descricao: 'Micro Empresa' },
      natureza_juridica: n % 3 === 0 ? { id: '2135', descricao: 'Empresário (Individual)' } : { id: '2062', descricao: 'Sociedade Empresária Limitada' },
      simples: { simples: 'Sim', mei: 'Não', data_opcao_simples: '2019-03-12', data_exclusao_simples: null },
      socios: [{ nome: 'SÓCIO ADMINISTRADOR EXEMPLO', tipo: 'Pessoa Física', data_entrada: '2019-03-12', qualificacao_socio: { id: 49, descricao: 'Sócio-Administrador' } }],
      estabelecimento: {
        cnpj: doc, tipo: 'Matriz', nome_fantasia: null, situacao_cadastral: 'Ativa', data_inicio_atividade: '2019-03-12',
        tipo_logradouro: 'RUA', logradouro: 'EXEMPLO', numero: String((n % 900) + 10), complemento: null, bairro: 'CENTRO', cep: '57000000',
        ddd1: '82', telefone1: '30000000', email: null,
        atividade_principal: n % 2 ? { id: '6920601', descricao: 'Atividades de contabilidade' } : { id: '4751201', descricao: 'Comércio varejista especializado de equipamentos e suprimentos de informática' },
        atividades_secundarias: [],
        estado: { sigla: c.uf }, cidade: { nome: c.city, ibge_id: c.ibge },
        inscricoes_estaduais: n % 2 ? [] : [{ inscricao_estadual: `24${doc.slice(0, 7)}`, ativo: true, estado: { sigla: c.uf } }],
      },
      _aviso: 'Dados simulados (modo sandbox): a consulta pública não respondeu.',
    };
    return { ...fromCnpjWs(raw), raw, fonte: 'simulado' };
  }
}

/** Consulta de CNPJ para as telas (cadastro de cliente e Consulta CNPJ). */
@Controller('cnpj')
export class CnpjController {
  constructor(private readonly cnpj: CnpjService) {}

  @Get(':cnpj')
  async consultar(@Param('cnpj') cnpj: string) {
    const { raw, fonte, ...dados } = await this.cnpj.lookup(cnpj);
    return { fonte, dados, raw };
  }
}
