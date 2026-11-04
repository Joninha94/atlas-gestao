export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const date = (v: string | Date | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

export const dateTime = (v: string | Date) => new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const comp = (c: string) => (c?.length === 7 ? `${c.slice(5)}/${c.slice(0, 4)}` : c);

export const doc = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

const LABELS: Record<string, string> = {
  DAS_SIMPLES: 'DAS Simples Nacional', DAS_MEI: 'DAS MEI', DCTFWEB_DARF: 'DCTFWeb (INSS)', FGTS_MENSAL: 'FGTS mensal', FGTS_RESCISORIA: 'FGTS rescisório', FGTS_MISTA: 'FGTS', DARF_AVULSO: 'DARF', PARCELAMENTO: 'Parcela',
  PENDENTE: 'Pendente', ENVIADA: 'Disponível', VISUALIZADA: 'Visualizada', PAGA: 'Paga', VENCIDA: 'Vencida', SUBSTITUIDA: 'Substituída',
  NFE: 'NF-e', NFCE: 'NFC-e', CTE: 'CT-e', NFSE: 'NFS-e', ENTRADA: 'Entrada', SAIDA: 'Saída', PRESTADO: 'Prestado', TOMADO: 'Tomado',
  NEGATIVA: 'Negativa', POSITIVA: 'Positiva', POSITIVA_COM_EFEITO_NEGATIVA: 'Positiva c/ efeito de negativa',
  CND_FEDERAL: 'CND Federal', CRF_FGTS: 'CRF (FGTS)', CNDT_TST: 'CNDT (Trabalhista)', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal',
  SIMPLES_NACIONAL: 'Simples Nacional', MEI: 'MEI', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real',
  ABERTA: 'Recebida', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada',
  AUTORIZADA: 'Autorizada', INDISPONIVEL: 'Indisponível', REGULAR: 'Regular', PENDENCIAS: 'Com pendências',
};
export const label = (k?: string | null) => (k ? LABELS[k] ?? k.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : '');

export const currentCompetence = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};
