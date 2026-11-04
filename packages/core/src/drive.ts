/**
 * Drive: estrutura de pastas automáticas e lixeira de 20 dias.
 */

export const TRASH_RETENTION_DAYS = 20;

export function isTrashExpired(deletedAt: Date, now: Date, days = TRASH_RETENTION_DAYS): boolean {
  return now.getTime() - deletedAt.getTime() >= days * 86_400_000;
}

/** Caminho da subpasta de sistema onde o Monitor/Notas guardam arquivos. */
export function systemFolderPath(kind: string, competence: string): string[] {
  const [year, month] = competence.split('-');
  const root: Record<string, string> = {
    DAS_SIMPLES: 'PGDAS',
    DAS_MEI: 'DAS-MEI',
    DCTFWEB_DARF: 'DCTFWeb',
    FGTS_MENSAL: 'FGTS',
    FGTS_RESCISORIA: 'FGTS',
    FGTS_MISTA: 'FGTS',
    PARCELAMENTO: 'Parcelamentos',
    CERTIDAO: 'Certidões',
    SITUACAO_FISCAL: 'Situação Fiscal',
    NFE: 'Notas/NF-e',
    NFCE: 'Notas/NFC-e',
    CTE: 'Notas/CT-e',
    NFSE: 'Notas/NFS-e',
  };
  const base = (root[kind] ?? kind).split('/');
  return month ? [...base, year, month] : [...base, year];
}

/** Pastas criadas automaticamente quando um cliente entra na base. */
export const DEFAULT_CLIENT_FOLDERS = [
  { name: 'Societário', shared: true }, // contrato social, cartão CNPJ, alvará
  { name: 'Fiscal', shared: false },
  { name: 'Pessoal', shared: false },
  { name: 'Contábil', shared: false },
  { name: 'WhatsApp', shared: false, kind: 'WHATSAPP' as const },
];

/** Nome de arquivo seguro para S3 e ZIP. */
export function safeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}
