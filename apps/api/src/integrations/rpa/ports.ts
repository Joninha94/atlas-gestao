/**
 * Portais SEM API pública: acesso por robô (Playwright) em fila dedicada (Queues.RPA),
 * com o certificado do escritório e a procuração do cliente.
 *
 * Regras:
 * - Cada porta tem implementação isolada em ./playwright/*. Seletores mudam: monitorar falhas e alertar.
 * - Portal com CAPTCHA: NÃO burlar. Retornar `requiresManual: true` e criar tarefa para o colaborador,
 *   ou usar fornecedor licenciado que tenha acordo com o órgão.
 * - Mensagens de caixa postal NUNCA recebem ciência automática.
 */

export interface RpaContext {
  tenantId: string;
  officeCert: { pfx: Buffer; passphrase: string };
  taxpayer: string; // CNPJ/CPF do cliente
}

export interface RpaResult<T> {
  ok: boolean;
  data?: T;
  requiresManual?: boolean;
  error?: string;
}

export interface FgtsGuide {
  kind: 'MENSAL' | 'RESCISORIA' | 'MISTA';
  competence: string;
  dueDate: string;
  principal: number;
  fine: number;
  interest: number;
  consignado: number;
  total: number;
  pdf: Buffer;
  pix?: string;
}

export interface FgtsEmployeeRow {
  registration?: string;
  name: string;
  cpf: string;
  admittedAt?: string;
  dismissedAt?: string;
  situation: 'ATIVO' | 'AFASTADO' | 'DESLIGADO';
  totalPaid?: number;
  avgSalary?: number;
}

export interface FgtsDigitalPort {
  listGuides(ctx: RpaContext, competence: string): Promise<RpaResult<FgtsGuide[]>>;
  listEmployees(ctx: RpaContext): Promise<RpaResult<FgtsEmployeeRow[]>>;
  payrollSummary(ctx: RpaContext, months: number): Promise<RpaResult<{ competence: string; payroll: number }[]>>;
  mailbox(ctx: RpaContext): Promise<RpaResult<MailboxItem[]>>;
  /** Regenera a guia com nova data de pagamento (recálculo). */
  recalc(ctx: RpaContext, competence: string, newDate: string): Promise<RpaResult<FgtsGuide>>;
}

export interface MailboxItem {
  externalId: string;
  subject: string;
  sender?: string;
  receivedAt: string;
  read: boolean;
}

export interface DetPort {
  mailbox(ctx: RpaContext): Promise<RpaResult<MailboxItem[]>>;
}

export interface PgfnPort {
  /** Dívida ativa: usa o código de referência informado pelo escritório (sem limite de quantidade). */
  installmentGuide(ctx: RpaContext, referenceCode: string): Promise<RpaResult<{ dueDate: string; total: number; pdf: Buffer }>>;
}

export interface CertidaoPort {
  fetch(ctx: RpaContext, kind: 'CND_FEDERAL' | 'CNDT_TST' | 'CRF_FGTS' | 'ESTADUAL', uf?: string): Promise<
    RpaResult<{ status: string; validTo?: string; pdf?: Buffer }>
  >;
}

/** UFs sem cobertura de certidão estadual automática no lançamento (mostrar “indisponível”). */
export const CERTIDAO_ESTADUAL_SEM_COBERTURA = new Set(['PI', 'PB', 'RO', 'RR', 'AC', 'AL']);
