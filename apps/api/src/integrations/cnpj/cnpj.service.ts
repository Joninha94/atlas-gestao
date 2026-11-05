import { Injectable, NotFoundException } from '@nestjs/common';
import { request } from 'undici';
import { onlyDigits } from '@produtiva/core';
import { isSandbox } from '../sandbox';

export interface CnpjData {
  legalName: string;
  tradeName?: string;
  legalNature?: string;
  cnae?: string;
  uf?: string;
  city?: string;
  ibgeCity?: string;
  street?: string;   // logradouro, número e complemento
  district?: string;
  zipCode?: string;
  openedAt?: string;
  partners: { name: string; role: string }[];
  simplesOptant?: boolean;
  meiOptant?: boolean;
  raw: unknown;
}

const CITIES = [
  { uf: 'AL', city: 'Maceió', ibge: '2704302' },
  { uf: 'AL', city: 'Arapiraca', ibge: '2700300' },
  { uf: 'PE', city: 'Recife', ibge: '2611606' },
  { uf: 'SE', city: 'Aracaju', ibge: '2800308' },
  { uf: 'BA', city: 'Salvador', ibge: '2927408' },
  { uf: 'SP', city: 'São Paulo', ibge: '3550308' },
];

/** Cadastro automático pelo CNPJ (cartão CNPJ + QSA). Fonte padrão: BrasilAPI. */
@Injectable()
export class CnpjService {
  async lookup(cnpj: string): Promise<CnpjData> {
    const doc = onlyDigits(cnpj);
    if (isSandbox()) {
      const n = Number(doc.slice(0, 4));
      return {
        legalName: `Empresa Exemplo ${doc.slice(0, 4)} Ltda`,
        tradeName: undefined,
        legalNature: n % 3 === 0 ? '213-5 - Empresário (Individual)' : '206-2 - Sociedade Empresária Limitada',
        cnae: n % 2 ? '6920601' : '4751201',
        uf: CITIES[n % CITIES.length].uf,
        city: CITIES[n % CITIES.length].city,
        ibgeCity: CITIES[n % CITIES.length].ibge,
        street: `RUA EXEMPLO, ${(n % 900) + 10}`,
        district: 'CENTRO',
        zipCode: '57000000',
        openedAt: '2019-03-12',
        partners: [{ name: 'Sócio Administrador', role: '49-Sócio-Administrador' }],
        raw: { sandbox: true },
      };
    }
    const res = await request(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
    if (res.statusCode !== 200) throw new NotFoundException('CNPJ não encontrado');
    const d = (await res.body.json()) as Record<string, any>;
    return {
      legalName: d.razao_social,
      tradeName: d.nome_fantasia || undefined,
      legalNature: d.natureza_juridica,
      cnae: String(d.cnae_fiscal ?? ''),
      uf: d.uf,
      city: d.municipio,
      ibgeCity: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : undefined,
      street: [[d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '), d.numero, d.complemento].filter((x) => x && String(x).trim()).join(', ') || undefined,
      district: d.bairro || undefined,
      zipCode: d.cep ? String(d.cep).replace(/\D/g, '') : undefined,
      openedAt: d.data_inicio_atividade,
      partners: (d.qsa ?? []).map((p: any) => ({ name: p.nome_socio, role: p.qualificacao_socio })),
      simplesOptant: d.opcao_pelo_simples ?? undefined,
      meiOptant: d.opcao_pelo_mei ?? undefined,
      raw: d,
    };
  }
}
