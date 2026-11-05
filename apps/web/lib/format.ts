export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const date = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

export const dateTime = (v?: string | Date | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

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
