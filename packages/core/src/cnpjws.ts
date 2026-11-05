/**
 * Consulta pública de CNPJ (https://publica.cnpj.ws/cnpj/{cnpj}) → dados de cadastro do cliente.
 * Função pura: recebe o JSON da API e devolve só o que o sistema usa; o JSON bruto é guardado à parte.
 * Limite da API pública: 3 consultas por minuto por IP (por isso a API do sistema guarda em cache).
 */
import { onlyDigits } from './documents';

export interface DadosCnpj {
  document: string;
  legalName: string;
  tradeName?: string;
  situation?: string;          // Ativa, Baixada, Inapta, Suspensa, Nula
  legalNature?: string;        // "2062 - Sociedade Empresária Limitada"
  size?: string;               // porte
  shareCapital?: number;
  cnae?: string;               // CNAE principal (7 dígitos)
  cnaeDescription?: string;
  street?: string;             // logradouro, número e complemento
  district?: string;
  zipCode?: string;
  city?: string;
  uf?: string;
  ibgeCity?: string;
  phone?: string;
  email?: string;
  openedAt?: string;           // AAAA-MM-DD
  stateRegistrations: { number: string; uf?: string; active: boolean }[];
  stateRegistration?: string;  // IE ativa na UF do estabelecimento
  partners: { name: string; role: string }[];
  simplesOptant?: boolean;
  meiOptant?: boolean;
  suggestedRegime?: 'MEI' | 'SIMPLES_NACIONAL';
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
const simNao = (v: unknown) => (typeof v === 'boolean' ? v : /^sim$/i.test(s(v)) ? true : /^n[aã]o$/i.test(s(v)) ? false : undefined);

export function fromCnpjWs(j: any): DadosCnpj {
  const e = j?.estabelecimento ?? {};
  const uf = s(e.estado?.sigla) || undefined;
  const logradouro = [s(e.tipo_logradouro), s(e.logradouro)].filter(Boolean).join(' ');
  const street = [logradouro, s(e.numero), s(e.complemento)].filter(Boolean).join(', ');
  const ies = (Array.isArray(e.inscricoes_estaduais) ? e.inscricoes_estaduais : []).map((i: any) => ({
    number: s(i.inscricao_estadual), uf: s(i.estado?.sigla) || undefined, active: i.ativo === true,
  })).filter((i: { number: string }) => i.number);
  const ieAtiva = ies.find((i: { uf?: string; active: boolean }) => i.active && (!uf || i.uf === uf)) ?? ies.find((i: { active: boolean }) => i.active);
  const fone = (ddd: unknown, n: unknown) => (s(n) ? `(${s(ddd)}) ${s(n).replace(/^(\d{4,5})(\d{4})$/, '$1-$2')}` : '');
  const simples = simNao(j?.simples?.simples);
  const mei = simNao(j?.simples?.mei);
  const capital = Number(s(j?.capital_social).replace(',', '.'));
  return {
    document: onlyDigits(s(e.cnpj) || s(j?.cnpj)),
    legalName: s(j?.razao_social),
    tradeName: s(e.nome_fantasia) || undefined,
    situation: s(e.situacao_cadastral) || undefined,
    legalNature: j?.natureza_juridica ? [s(j.natureza_juridica.id), s(j.natureza_juridica.descricao)].filter(Boolean).join(' - ') : undefined,
    size: s(j?.porte?.descricao) || undefined,
    shareCapital: Number.isFinite(capital) ? capital : undefined,
    cnae: s(e.atividade_principal?.id) || undefined,
    cnaeDescription: s(e.atividade_principal?.descricao) || undefined,
    street: street || undefined,
    district: s(e.bairro) || undefined,
    zipCode: onlyDigits(s(e.cep)) || undefined,
    city: s(e.cidade?.nome) || undefined,
    uf,
    ibgeCity: s(e.cidade?.ibge_id) || undefined,
    phone: [fone(e.ddd1, e.telefone1), fone(e.ddd2, e.telefone2)].filter(Boolean).join(' / ') || undefined,
    email: s(e.email).toLowerCase() || undefined,
    openedAt: s(e.data_inicio_atividade) || undefined,
    stateRegistrations: ies,
    stateRegistration: ieAtiva?.number,
    partners: (Array.isArray(j?.socios) ? j.socios : []).map((p: any) => ({ name: s(p.nome), role: s(p.qualificacao_socio?.descricao) })).filter((p: { name: string }) => p.name),
    simplesOptant: simples,
    meiOptant: mei,
    suggestedRegime: mei ? 'MEI' : simples ? 'SIMPLES_NACIONAL' : undefined,
  };
}

/** Máscaras no padrão da Receita Federal. */
export function formatCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}
export function formatCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
/** CPF até 11 dígitos, CNPJ acima disso (campo único "CPF/CNPJ"). */
export function formatDocumento(v: string) {
  return onlyDigits(v).length > 11 ? formatCnpj(v) : formatCpf(v);
}
