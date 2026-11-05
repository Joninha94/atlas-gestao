'use client';
import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { erroDocumento, formatCep, formatCnpj, formatCpf, onlyDigits } from '../../lib/documentos';

/**
 * Consulta CNPJ — API pública CNPJ.ws (https://publica.cnpj.ws/cnpj/{cnpj}).
 * O navegador consulta direto a API pública; se ela não responder (rede/CORS), usa a API do sistema
 * como reserva (mesma fonte, com cache de 24 h). Limite da API pública: 3 consultas por minuto.
 * Ícones: SVG próprios (sem biblioteca externa).
 */

type Estado =
  | { fase: 'inicio' }
  | { fase: 'carregando'; cnpj: string }
  | { fase: 'erro'; cnpj: string; titulo: string; detalhe: string; espera?: number }
  | { fase: 'ok'; cnpj: string; json: any; fonte: string; em: Date };

const RECENTES = 'produtiva.consulta-cnpj.recentes';

// ------------------------------------------------------------------------------------------- ícones
const Svg = ({ children, size = 18, className = '' }: { children: ReactNode; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);
const IconBusca = (p: { size?: number; className?: string }) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
const IconCopiar = (p: { size?: number; className?: string }) => <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>;
const IconCodigo = (p: { size?: number; className?: string }) => <Svg {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5" /></Svg>;
const IconCheck = (p: { size?: number; className?: string }) => <Svg {...p}><path d="m5 12 5 5 9-10" /></Svg>;
const IconAlerta = (p: { size?: number; className?: string }) => <Svg {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></Svg>;
const IconPredio = (p: { size?: number; className?: string }) => <Svg {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" /></Svg>;
const IconMapa = (p: { size?: number; className?: string }) => <Svg {...p}><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></Svg>;
const IconFone = (p: { size?: number; className?: string }) => <Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></Svg>;
const IconEmail = (p: { size?: number; className?: string }) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
const IconSeta = ({ aberto, size = 14 }: { aberto: boolean; size?: number }) => <Svg size={size} className={`transition-transform ${aberto ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></Svg>;
const IconMais = (p: { size?: number; className?: string }) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;

// ------------------------------------------------------------------------------------------- formatação
const DATA_ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const ROTULOS: Record<string, string> = {
  cnpj: 'CNPJ', cnpj_raiz: 'CNPJ raiz', cpf_cnpj_socio: 'CPF/CNPJ do sócio', cep: 'CEP', ddd1: 'DDD 1', ddd2: 'DDD 2', ddd_fax: 'DDD fax',
  ibge_id: 'Código IBGE', siafi_id: 'Código SIAFI', iso2: 'ISO 2', iso3: 'ISO 3', mei: 'MEI', id: 'Código', uf: 'UF', email: 'E-mail',
  razao_social: 'Razão social', nome_fantasia: 'Nome fantasia', situacao_cadastral: 'Situação cadastral', capital_social: 'Capital social',
  inscricoes_estaduais: 'Inscrições estaduais', atividade_principal: 'Atividade principal (CNAE)', atividades_secundarias: 'Atividades secundárias',
  socios: 'Quadro de sócios e administradores', natureza_juridica: 'Natureza jurídica', qualificacao_do_responsavel: 'Qualificação do responsável',
};
// A API devolve nomes sem acento (descricao, situacao…): acentua as palavras mais comuns
const ACENTOS: Record<string, string> = {
  descricao: 'descrição', situacao: 'situação', inicio: 'início', numero: 'número', secao: 'seção', divisao: 'divisão', opcao: 'opção',
  exclusao: 'exclusão', pais: 'país', codigo: 'código', faixa: 'faixa', etaria: 'etária', qualificacao: 'qualificação', inscricao: 'inscrição',
  digito: 'dígito', verificador: 'verificador', especial: 'especial', razao: 'razão', responsavel: 'responsável', atualizado: 'atualizado',
  telefone1: 'telefone 1', telefone2: 'telefone 2', ddd: 'DDD', uf: 'UF', ibge: 'IBGE', siafi: 'SIAFI', comex: 'Comex',
};
const rotulo = (k: string) => ROTULOS[k] ?? k.split('_').map((w) => ACENTOS[w.toLowerCase()] ?? w).join(' ').replace(/^(.)/, (c) => c.toUpperCase()).replace(/\bcnpj\b/gi, 'CNPJ').replace(/\bcpf\b/gi, 'CPF').replace(/\bcnae\b/gi, 'CNAE').replace(/\bmei\b/gi, 'MEI');

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

function dataBR(v: string) {
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return v.length === 10 ? d.toLocaleDateString('pt-BR') : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
const moeda = (v: unknown) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata um valor simples pelo nome do campo e pelo tipo. */
function formatar(chave: string, v: unknown): { texto: string; tipo: 'bool' | 'vazio' | 'texto' | 'sim' | 'nao' } {
  if (vazio(v)) return { texto: '—', tipo: 'vazio' };
  if (typeof v === 'boolean') return { texto: v ? 'Sim' : 'Não', tipo: v ? 'sim' : 'nao' };
  const s = String(v).replace(/\s{2,}/g, ' ').trim();
  const k = chave.toLowerCase();
  if (/^(sim|não|nao)$/i.test(s)) return { texto: s, tipo: /^sim$/i.test(s) ? 'sim' : 'nao' };
  if (k === 'capital_social' || /valor|capital/.test(k)) return Number.isFinite(Number(s)) ? { texto: moeda(s), tipo: 'texto' } : { texto: s, tipo: 'texto' };
  if (/cep/.test(k) && onlyDigits(s).length === 8) return { texto: formatCep(s), tipo: 'texto' };
  if (/cnpj/.test(k) && !/raiz|ordem|digito/.test(k) && onlyDigits(s).length === 14 && !s.includes('*')) return { texto: formatCnpj(s), tipo: 'texto' };
  if (/cpf/.test(k) && onlyDigits(s).length === 11 && !s.includes('*')) return { texto: formatCpf(s), tipo: 'texto' };
  if (/^cnpj_raiz$/.test(k) && onlyDigits(s).length === 8) return { texto: s.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2.$3'), tipo: 'texto' };
  if (DATA_ISO.test(s)) return { texto: dataBR(s), tipo: 'texto' };
  return { texto: s, tipo: 'texto' };
}

/** Conta valores "folha" preenchidos e o total (objetos e listas são percorridos). */
function contar(v: unknown): { preenchidos: number; total: number } {
  if (Array.isArray(v)) return v.length ? v.reduce((a, x) => { const c = contar(x); return { preenchidos: a.preenchidos + c.preenchidos, total: a.total + c.total }; }, { preenchidos: 0, total: 0 }) : { preenchidos: 0, total: 1 };
  if (v && typeof v === 'object') return Object.values(v).reduce<{ preenchidos: number; total: number }>((a, x) => { const c = contar(x); return { preenchidos: a.preenchidos + c.preenchidos, total: a.total + c.total }; }, { preenchidos: 0, total: 0 });
  return { preenchidos: vazio(v) ? 0 : 1, total: 1 };
}

const fone = (ddd?: string | null, n?: string | null) => (n ? `(${ddd ?? ''}) ${String(n).replace(/^(\d{4,5})(\d{4})$/, '$1-$2')}` : '');

// ------------------------------------------------------------------------------------------- página
export default function ConsultaCnpj() {
  const [cnpj, setCnpj] = useState('');
  const [tocado, setTocado] = useState(false);
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' });
  const [recentes, setRecentes] = useState<{ cnpj: string; nome: string }[]>([]);
  const erro = erroDocumento(cnpj, 'cnpj');
  const digitos = onlyDigits(cnpj);

  useEffect(() => { try { setRecentes(JSON.parse(localStorage.getItem(RECENTES) ?? '[]')); } catch { /* sem armazenamento */ } }, []);
  // contagem regressiva quando a API pública limita (3/min)
  useEffect(() => {
    if (estado.fase !== 'erro' || !estado.espera) return;
    const t = setTimeout(() => setEstado({ ...estado, espera: estado.espera! - 1 }), 1000);
    return () => clearTimeout(t);
  }, [estado]);

  async function consultar(alvo = digitos) {
    setTocado(true);
    if (erroDocumento(alvo, 'cnpj') || alvo.length !== 14) return;
    setCnpj(formatCnpj(alvo));
    setEstado({ fase: 'carregando', cnpj: alvo });
    let res: Response | null = null;
    try {
      res = await fetch(`https://publica.cnpj.ws/cnpj/${alvo}`, { headers: { Accept: 'application/json' } });
    } catch {
      res = null; // rede/CORS: tenta pela API do sistema
    }
    try {
      if (res) {
        const body = await res.json().catch(() => ({}));
        if (res.ok) return sucesso(alvo, body, 'API pública CNPJ.ws');
        if (res.status === 404) return setEstado({ fase: 'erro', cnpj: alvo, titulo: 'CNPJ não encontrado', detalhe: 'Não existe empresa com este CNPJ na base pública da Receita Federal.' });
        if (res.status === 429) {
          const seg = Number(String(body?.detalhes ?? '').match(/(\d+)\s*segundo/)?.[1]) || 60;
          return setEstado({ fase: 'erro', cnpj: alvo, titulo: 'Limite de consultas atingido', detalhe: 'A API pública permite 3 consultas por minuto. Aguarde para consultar de novo.', espera: seg });
        }
        if (res.status === 400) return setEstado({ fase: 'erro', cnpj: alvo, titulo: 'CNPJ inválido', detalhe: body?.detalhes ?? 'A API recusou o número informado.' });
      }
      const r = await api<any>(`/cnpj/${alvo}`);
      sucesso(alvo, r.raw, r.fonte === 'simulado' ? 'Dados simulados (modo sandbox)' : `API do sistema (${r.fonte})`);
    } catch (e) {
      const m = (e as Error).message;
      setEstado({ fase: 'erro', cnpj: alvo, titulo: /não encontrado/i.test(m) ? 'CNPJ não encontrado' : 'Não foi possível consultar', detalhe: m || 'Verifique sua conexão com a internet e tente novamente.' });
    }
  }

  function sucesso(alvo: string, json: any, fonte: string) {
    setEstado({ fase: 'ok', cnpj: alvo, json, fonte, em: new Date() });
    const nome = json?.razao_social ?? json?.estabelecimento?.nome_fantasia ?? '';
    const lista = [{ cnpj: alvo, nome }, ...recentes.filter((r) => r.cnpj !== alvo)].slice(0, 6);
    setRecentes(lista);
    try { localStorage.setItem(RECENTES, JSON.stringify(lista)); } catch { /* ignora */ }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); consultar(); };
  const bloqueado = estado.fase === 'carregando' || (estado.fase === 'erro' && !!estado.espera && estado.espera > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">Consulta CNPJ</h1>
        <p className="text-sm text-ink-soft">Dados públicos da Receita Federal pela API CNPJ.ws: cadastro, endereço, atividades, sócios e inscrições estaduais.</p>
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <label htmlFor="cnpj" className="label">CNPJ</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><IconPredio /></span>
              <input
                id="cnpj" inputMode="numeric" autoComplete="off" autoFocus maxLength={18} placeholder="00.000.000/0000-00"
                className={`input h-12 pl-10 text-lg tracking-wide tabular-nums ${tocado && erro ? 'border-red-400' : ''}`}
                value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} onBlur={() => setTocado(true)}
                aria-invalid={!!(tocado && erro)} aria-describedby="cnpj-ajuda"
              />
            </div>
            <p id="cnpj-ajuda" className={`mt-1 text-xs ${tocado && erro ? 'text-red-600' : 'text-ink-muted'}`}>
              {tocado && erro ? erro : digitos.length === 14 && !erro ? '✓ CNPJ válido' : 'Digite os 14 números; a máscara e a validação são automáticas.'}
            </p>
          </div>
          <button type="submit" disabled={bloqueado || !!erro || digitos.length !== 14}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand-700 px-6 font-medium text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">
            {estado.fase === 'carregando' ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Consultando…</> : <><IconBusca /> Consultar</>}
          </button>
        </div>
        {recentes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-muted">Recentes:</span>
            {recentes.map((r) => (
              <button key={r.cnpj} type="button" disabled={bloqueado} onClick={() => consultar(r.cnpj)}
                className="max-w-[260px] truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-ink-soft hover:bg-slate-100 disabled:opacity-50" title={r.nome}>
                {formatCnpj(r.cnpj)}{r.nome ? ` · ${r.nome}` : ''}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="mt-5">
        {estado.fase === 'inicio' && <Vazio />}
        {estado.fase === 'carregando' && <Esqueleto />}
        {estado.fase === 'erro' && <Erro e={estado} onTentar={() => consultar(estado.cnpj)} />}
        {estado.fase === 'ok' && <Resultado e={estado} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- estados
function Vazio() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700"><IconBusca size={22} /></span>
      <p className="font-medium text-ink">Consulte qualquer CNPJ</p>
      <p className="mt-1 max-w-md text-sm text-ink-soft">Você verá um resumo e, logo abaixo, todos os campos que a Receita devolver para esse CNPJ, organizados automaticamente.</p>
    </div>
  );
}

function Esqueleto() {
  const b = 'animate-pulse rounded bg-slate-200/80';
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className={`${b} h-6 w-2/3`} /><div className={`${b} mt-2 h-4 w-1/3`} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <div key={i}><div className={`${b} h-3 w-24`} /><div className={`${b} mt-2 h-4 w-40`} /></div>)}</div>
      </div>
      <div className={`${b} h-40 w-full`} />
    </div>
  );
}

function Erro({ e, onTentar }: { e: Extract<Estado, { fase: 'erro' }>; onTentar: () => void }) {
  const esperando = !!e.espera && e.espera > 0;
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><IconAlerta /></span>
      <div className="flex-1">
        <p className="font-semibold text-red-800">{e.titulo}</p>
        <p className="text-sm text-red-700">{e.detalhe} <span className="text-red-600/80">CNPJ {formatCnpj(e.cnpj)}.</span></p>
      </div>
      <button onClick={onTentar} disabled={esperando} className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60">
        {esperando ? `Tentar em ${e.espera}s` : 'Tentar novamente'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- resultado
function Resultado({ e }: { e: Extract<Estado, { fase: 'ok' }> }) {
  const j = e.json ?? {};
  const est = j.estabelecimento ?? {};
  const [bruto, setBruto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const cont = useMemo(() => contar(j), [j]);
  const situacao = String(est.situacao_cadastral ?? '—');
  const ativa = /ativa/i.test(situacao);
  const endereco = [[est.tipo_logradouro, est.logradouro].filter(Boolean).join(' '), est.numero, est.complemento && String(est.complemento).replace(/\s{2,}/g, ' ').trim(), est.bairro].filter(Boolean).join(', ');
  const fones = [fone(est.ddd1, est.telefone1), fone(est.ddd2, est.telefone2)].filter(Boolean);
  const ies: any[] = Array.isArray(est.inscricoes_estaduais) ? est.inscricoes_estaduais : [];

  async function copiar() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(j, null, 2));
    } catch {
      const t = document.createElement('textarea');
      t.value = JSON.stringify(j, null, 2); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white p-5 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${ativa ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${ativa ? 'bg-emerald-500' : 'bg-red-500'}`} />{situacao}
              </span>
              {est.tipo && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-ink-soft">{est.tipo}</span>}
              {j.porte?.descricao && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-ink-soft">{j.porte.descricao}</span>}
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold leading-snug text-ink sm:text-xl">{j.razao_social ?? '—'}</h2>
            <p className="text-sm text-ink-soft">{est.nome_fantasia ? <>Fantasia: <b className="font-medium">{est.nome_fantasia}</b> · </> : null}<span className="tabular-nums">{formatCnpj(est.cnpj ?? e.cnpj)}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setBruto((b) => !b)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><IconCodigo size={16} /> {bruto ? 'Ocultar JSON' : 'Ver JSON bruto'}</button>
            <button onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50" aria-live="polite">
              {copiado ? <><IconCheck size={16} className="text-emerald-600" /> Copiado!</> : <><IconCopiar size={16} /> Copiar JSON</>}
            </button>
            <Link href={`/clientes?novo=${e.cnpj}`} className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"><IconMais size={16} /> Cadastrar cliente</Link>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Info rotulo="Razão social" valor={j.razao_social} />
          <Info rotulo="Nome fantasia" valor={est.nome_fantasia} />
          <Info rotulo="Situação cadastral" valor={[situacao, est.data_situacao_cadastral && `desde ${dataBR(est.data_situacao_cadastral)}`].filter(Boolean).join(' ')} />
          <Info rotulo="Endereço" valor={endereco} icone={<IconMapa size={15} />} className="sm:col-span-2" />
          <Info rotulo="Cidade/UF · CEP" valor={[est.cidade?.nome && `${est.cidade.nome}/${est.estado?.sigla ?? ''}`, est.cep && formatCep(est.cep)].filter(Boolean).join(' · ')} />
          <Info rotulo="CNAE principal" valor={est.atividade_principal ? `${est.atividade_principal.subclasse ?? est.atividade_principal.id} · ${est.atividade_principal.descricao}` : null} className="sm:col-span-2" />
          <Info rotulo="Abertura" valor={est.data_inicio_atividade ? dataBR(est.data_inicio_atividade) : null} />
          <Info rotulo="Telefone" valor={fones.join(' / ')} icone={<IconFone size={15} />} />
          <Info rotulo="E-mail" valor={est.email ? String(est.email).toLowerCase() : null} icone={<IconEmail size={15} />} />
          <Info rotulo="Capital social" valor={j.capital_social ? moeda(j.capital_social) : null} />
          <Info rotulo="Natureza jurídica" valor={j.natureza_juridica ? `${j.natureza_juridica.id} · ${j.natureza_juridica.descricao}` : null} />
          <Info rotulo="Simples / MEI" valor={j.simples ? `Simples: ${j.simples.simples ?? '—'} · MEI: ${j.simples.mei ?? '—'}` : null} />
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Inscrições estaduais</div>
            {ies.length ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ies.map((ie, i) => (
                  <span key={i} className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm ${ie.ativo ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-ink-soft line-through decoration-slate-400/60'}`}>
                    <b className="tabular-nums">{ie.inscricao_estadual}</b><span className="text-xs">{ie.estado?.sigla} · {ie.ativo ? 'ativa' : 'inativa'}</span>
                  </span>
                ))}
              </div>
            ) : <p className="mt-1 text-sm text-ink-muted">Nenhuma inscrição estadual informada.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-ink-soft">
          <span><b className="text-ink">{cont.preenchidos}</b> de {cont.total} campos preenchidos</span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${cont.total ? Math.round((cont.preenchidos / cont.total) * 100) : 0}%` }} /></span>
          <span>Fonte: {e.fonte}</span>
          <span>Consultado em {e.em.toLocaleString('pt-BR')}</span>
          {j.atualizado_em && <span>Base atualizada em {dataBR(j.atualizado_em)}</span>}
        </div>
      </section>

      {bruto && (
        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-card">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-400"><span>JSON bruto da API</span><button onClick={copiar} className="text-slate-300 hover:text-white">{copiado ? 'Copiado!' : 'Copiar'}</button></div>
          <pre className="max-h-[480px] overflow-auto p-4 text-xs leading-relaxed text-slate-200"><JsonColorido json={j} /></pre>
        </section>
      )}

      <TodosOsDados json={j} />
    </div>
  );
}

function Info({ rotulo: r, valor, icone, className = '' }: { rotulo: string; valor?: ReactNode; icone?: ReactNode; className?: string }) {
  const tem = !vazio(valor);
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{r}</div>
      <div className={`mt-0.5 flex items-start gap-1.5 break-words text-sm ${tem ? 'text-ink' : 'text-ink-muted'}`}>{tem && icone && <span className="mt-0.5 shrink-0 text-ink-muted">{icone}</span>}{tem ? valor : '—'}</div>
    </div>
  );
}

/** Destaque simples de sintaxe do JSON, sem bibliotecas. */
function JsonColorido({ json }: { json: unknown }) {
  const txt = JSON.stringify(json, null, 2);
  const partes = txt.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g);
  return <>{partes.map((p, i) => {
    if (!p) return null;
    if (/^".*":$/.test(p.replace(/\s/g, ''))) return <span key={i} className="text-sky-300">{p}</span>;
    if (p.startsWith('"')) return <span key={i} className="text-emerald-300">{p}</span>;
    if (/^(true|false)$/.test(p)) return <span key={i} className="text-amber-300">{p}</span>;
    if (p === 'null') return <span key={i} className="text-slate-500">{p}</span>;
    if (/^-?\d/.test(p)) return <span key={i} className="text-violet-300">{p}</span>;
    return <span key={i}>{p}</span>;
  })}</>;
}

// ------------------------------------------------------------------------------------------- dados dinâmicos
/**
 * Renderiza QUALQUER JSON: objetos viram grades de campos, listas de valores viram etiquetas,
 * listas de objetos viram tabela (quando os itens são "planos") ou cartões (quando têm objetos dentro).
 */
function TodosOsDados({ json }: { json: any }) {
  const [filtro, setFiltro] = useState('');
  const [esconderVazios, setEsconderVazios] = useState(false);
  const [versao, setVersao] = useState({ n: 0, aberto: true });
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h3 className="font-semibold text-ink">Todos os dados retornados</h3>
          <p className="text-xs text-ink-soft">Gerado automaticamente a partir do JSON — campos diferentes aparecem sozinhos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input h-9 w-full sm:w-56" placeholder="Filtrar campos…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <label className="flex items-center gap-1.5 text-xs text-ink-soft"><input type="checkbox" checked={esconderVazios} onChange={(e) => setEsconderVazios(e.target.checked)} /> Ocultar vazios</label>
          <button onClick={() => setVersao((v) => ({ n: v.n + 1, aberto: true }))} className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-slate-100">Expandir tudo</button>
          <button onClick={() => setVersao((v) => ({ n: v.n + 1, aberto: false }))} className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-slate-100">Recolher tudo</button>
        </div>
      </div>
      <div className="p-4" key={versao.n}>
        <Objeto obj={json} filtro={filtro.trim().toLowerCase()} esconderVazios={esconderVazios} abertoPadrao={versao.aberto} nivel={0} />
      </div>
    </section>
  );
}

const ehPrimitivo = (v: unknown) => v === null || typeof v !== 'object';
const combina = (k: string, v: unknown, f: string): boolean => {
  if (!f) return true;
  if (rotulo(k).toLowerCase().includes(f) || k.toLowerCase().includes(f)) return true;
  if (ehPrimitivo(v)) return formatar(k, v).texto.toLowerCase().includes(f);
  return Object.entries(v as object).some(([kk, vv]) => combina(kk, vv, f)) || (Array.isArray(v) && v.some((x, i) => combina(String(i), x, f)));
};

function Objeto({ obj, filtro, esconderVazios, abertoPadrao, nivel }: { obj: Record<string, any>; filtro: string; esconderVazios: boolean; abertoPadrao: boolean; nivel: number }) {
  const entradas = Object.entries(obj ?? {}).filter(([k, v]) => combina(k, v, filtro) && !(esconderVazios && vazio(v)));
  const simples = entradas.filter(([, v]) => ehPrimitivo(v));
  const compostos = entradas.filter(([, v]) => !ehPrimitivo(v));
  if (!entradas.length) return <p className="text-sm text-ink-muted">{filtro ? 'Nenhum campo corresponde ao filtro.' : 'Sem dados.'}</p>;
  return (
    <div className="space-y-3">
      {simples.length > 0 && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {simples.map(([k, v]) => <Campo key={k} k={k} v={v} />)}
        </dl>
      )}
      {compostos.map(([k, v]) => (
        <Secao key={k} titulo={rotulo(k)} resumo={Array.isArray(v) ? `${v.length} ${v.length === 1 ? 'item' : 'itens'}` : `${Object.keys(v).length} campos`} abertoPadrao={abertoPadrao} nivel={nivel}>
          {Array.isArray(v) ? <Lista lista={v} chave={k} filtro={filtro} esconderVazios={esconderVazios} abertoPadrao={abertoPadrao} nivel={nivel + 1} />
            : <Objeto obj={v} filtro={combina(k, '', filtro) ? '' : filtro} esconderVazios={esconderVazios} abertoPadrao={abertoPadrao} nivel={nivel + 1} />}
        </Secao>
      ))}
    </div>
  );
}

function Campo({ k, v }: { k: string; v: unknown }) {
  const f = formatar(k, v);
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted" title={k}>{rotulo(k)}</dt>
      <dd className="mt-0.5 break-words text-sm">
        {f.tipo === 'sim' && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">{f.texto}</span>}
        {f.tipo === 'nao' && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{f.texto}</span>}
        {f.tipo === 'vazio' && <span className="text-ink-muted">—</span>}
        {f.tipo === 'texto' && <span className="text-ink">{f.texto}</span>}
      </dd>
    </div>
  );
}

function Secao({ titulo, resumo, abertoPadrao, nivel, children }: { titulo: string; resumo: string; abertoPadrao: boolean; nivel: number; children: ReactNode }) {
  const [aberto, setAberto] = useState(abertoPadrao);
  return (
    <div className={`rounded-lg border ${nivel === 0 ? 'border-slate-200' : 'border-slate-100'} bg-white`}>
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left ${nivel === 0 ? 'bg-slate-50/80' : ''} rounded-lg hover:bg-slate-50`}>
        <IconSeta aberto={aberto} /><span className="text-sm font-semibold text-ink">{titulo}</span><span className="text-xs text-ink-muted">{resumo}</span>
      </button>
      {aberto && <div className="border-t border-slate-100 p-3">{children}</div>}
    </div>
  );
}

function Lista({ lista, chave, filtro, esconderVazios, abertoPadrao, nivel }: { lista: any[]; chave: string; filtro: string; esconderVazios: boolean; abertoPadrao: boolean; nivel: number }) {
  if (!lista.length) return <p className="text-sm text-ink-muted">Lista vazia.</p>;
  // Lista de valores simples → etiquetas
  if (lista.every(ehPrimitivo)) {
    return <div className="flex flex-wrap gap-1.5">{lista.map((v, i) => <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-sm">{formatar(chave, v).texto}</span>)}</div>;
  }
  const objetos = lista.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  const colunas = [...new Set(objetos.flatMap((o) => Object.keys(o)))];
  const planos = objetos.length === lista.length && objetos.every((o) => Object.values(o).every((v) => ehPrimitivo(v) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(ehPrimitivo))));
  // Lista de objetos "planos" (ou com objetos simples dentro) → tabela; objetos internos viram "descricao/nome/sigla"
  if (planos && colunas.length <= 12) {
    const resumir = (v: any) => (v && typeof v === 'object' ? v.descricao ?? v.nome ?? v.sigla ?? Object.values(v).filter((x) => !vazio(x)).join(' · ') : v);
    const cols = colunas.filter((c) => !esconderVazios || objetos.some((o) => !vazio(o[c])));
    const linhas = objetos.filter((o) => !filtro || Object.entries(o).some(([k, v]) => combina(k, v, filtro)) || combina(chave, '', filtro));
    return (
      <div className="overflow-x-auto rounded-md border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr>{cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{rotulo(c)}</th>)}</tr></thead>
          <tbody>{linhas.map((o, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              {cols.map((c) => { const f = formatar(c, resumir(o[c])); return <td key={c} className={`px-3 py-2 ${f.tipo === 'vazio' ? 'text-ink-muted' : f.tipo === 'sim' ? 'font-medium text-emerald-700' : ''}`}>{f.texto}</td>; })}
            </tr>
          ))}</tbody>
        </table>
        {linhas.length < objetos.length && <p className="px-3 py-2 text-xs text-ink-muted">{objetos.length - linhas.length} itens ocultos pelo filtro.</p>}
      </div>
    );
  }
  // Lista de objetos complexos → um cartão por item
  return (
    <div className="space-y-2">
      {lista.map((item, i) => (
        <Secao key={i} titulo={`${rotulo(chave).replace(/s$/, '')} ${i + 1}`} resumo={item && typeof item === 'object' ? String(item.nome ?? item.descricao ?? item.razao_social ?? '') : ''} abertoPadrao={abertoPadrao && lista.length <= 5} nivel={nivel}>
          {ehPrimitivo(item) ? <span className="text-sm">{formatar(chave, item).texto}</span>
            : Array.isArray(item) ? <Lista lista={item} chave={chave} filtro={filtro} esconderVazios={esconderVazios} abertoPadrao={abertoPadrao} nivel={nivel + 1} />
            : <Objeto obj={item} filtro={filtro} esconderVazios={esconderVazios} abertoPadrao={abertoPadrao} nivel={nivel + 1} />}
        </Secao>
      ))}
    </div>
  );
}
