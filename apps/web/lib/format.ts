export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Data legível: "05 nov 2026" (datas de vencimento são gravadas ao meio-dia UTC). */
export const date = (v?: string | Date | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(+d)) return '—';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MES3[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Data e hora no fuso de Maceió: "05 nov 2026, 14:32" (sem o ano quando é o ano atual). */
export const dateTime = (v?: string | Date | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(+d)) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', day: '2-digit', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  const year = Number(p.year) === new Date().getFullYear() ? '' : ` ${p.year}`;
  return `${p.day} ${MES3[Number(p.month) - 1]}${year}, ${p.hour}:${p.minute}`;
};

/** Prazo relativo a hoje (Maceió): "hoje", "amanhã", "em 5 dias", "atrasada há 3 dias". */
export const relativeDue = (v?: string | Date | null): { text: string; tone: 'red' | 'amber' | 'muted' } | null => {
  if (!v) return null;
  const d = new Date(v);
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Maceio' }));
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((a - b) / 86_400_000);
  if (days === 0) return { text: 'vence hoje', tone: 'amber' };
  if (days === 1) return { text: 'vence amanhã', tone: 'amber' };
  if (days > 1) return { text: `em ${days} dias`, tone: days <= 5 ? 'amber' : 'muted' };
  return { text: days === -1 ? 'venceu ontem' : `venceu há ${-days} dias`, tone: 'red' };
};

/** "2026-10" → "outubro de 2026". */
export const monthLabel = (c?: string | null) => {
  if (!c || !/^\d{4}-\d{2}$/.test(c)) return '—';
  const [y, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
};

export const competence = (c?: string | null) => (c ? c.split('-').reverse().join('/') : '—');

export const doc = (d?: string | null) => {
  if (!d) return '—';
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
};

export const duration = (s?: number | null) => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;
};

export const lastCompetence = () => {
  const d = new Date();
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const monthsAgo = (n: number) => {
  const d = new Date();
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const LABELS: Record<string, string> = {
  // regimes
  MEI: 'MEI', SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real', IMUNE_ISENTA: 'Imune/Isenta', PESSOA_FISICA: 'Pessoa física',
  // guias
  DAS_SIMPLES: 'DAS Simples', DAS_MEI: 'DAS-MEI', DCTFWEB_DARF: 'DCTFWeb', FGTS_MENSAL: 'FGTS mensal', FGTS_RESCISORIA: 'FGTS rescisória', FGTS_MISTA: 'FGTS mista', PARCELAMENTO: 'Parcelamento', DARF_AVULSO: 'DARF',
  PENDENTE: 'Pendente', ENVIADA: 'Enviada', VISUALIZADA: 'Visualizada', PAGA: 'Paga', VENCIDA: 'Vencida', CANCELADA: 'Substituída',
  // declarações
  PGDASD: 'PGDAS-D', DASN_SIMEI: 'DASN-SIMEI', DCTFWEB: 'DCTFWeb', FGTS_DIGITAL: 'FGTS Digital', DEFIS: 'DEFIS', DIRF: 'DIRF', ENTREGUE: 'Entregue', AUSENTE: 'Ausente', EM_ABERTO: 'Em aberto', RETIFICADA: 'Retificada',
  // tarefas
  A_FAZER: 'Aberta', EM_PROGRESSO: 'Aberta · em andamento', CONCLUIDO: 'Concluída', DISPENSADO: 'Desconsiderada', EM_MULTA: 'Aberta · em multa', IMPEDIMENTO: 'Impedimento', ABERTA: 'Aberta',
  // conversas
  NA_URA: 'Na URA', AGUARDANDO: 'Aguardando', EM_ATENDIMENTO: 'Em atendimento', ENCERRADA: 'Encerrada',
  // certidões
  CND_FEDERAL: 'CND Federal', CNDT_TST: 'CNDT (TST)', CRF_FGTS: 'CRF (FGTS)', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal',
  NEGATIVA: 'Negativa', POSITIVA_COM_EFEITO_NEGATIVA: 'Positiva c/ efeito de negativa', POSITIVA: 'Positiva', INDISPONIVEL: 'Indisponível', ERRO: 'Erro',
  // notas
  NFE: 'NF-e', NFCE: 'NFC-e', CTE: 'CT-e', NFSE: 'NFS-e', ENTRADA: 'Entrada', SAIDA: 'Saída', PRESTADO: 'Prestado', TOMADO: 'Tomado',
  // canais e papéis
  EMAIL: 'E-mail', WHATSAPP: 'WhatsApp', APP: 'App', ADMIN: 'Administrador', GESTOR: 'Gestor', COLABORADOR: 'Colaborador',
  ECAC: 'e-CAC', DET: 'DET',
};
export const label = (k?: string | null) => (k ? LABELS[k] ?? k : '—');
