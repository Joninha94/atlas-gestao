/** Nomes das filas BullMQ. Cada job processa UM cliente, para isolar falhas e permitir retry. */
export const Queues = {
  MONITOR: 'monitor',
  XML: 'xml',
  COMM: 'comm',
  TASKS: 'tasks',
  DRIVE: 'drive',
  RPA: 'rpa', // consumida pelos robôs Playwright (apps/rpa)
} as const;

export const MonitorJobs = {
  DISPATCH_DAY: 'monitor.dispatch-day', // cron diário: descobre quem roda hoje e enfileira por cliente
  RUN_ROUTINE: 'monitor.run-routine', // um cliente + uma rotina
  PLAN_RECEIPTS: 'plan.receipts',
  PLAN_MAILBOX: 'plan.mailbox',
  PLAN_DECLARATIONS: 'plan.declarations',
  PLAN_CERTIDOES: 'plan.certidoes',
  RECEIPTS: 'monitor.receipts',
  MAILBOX: 'monitor.mailbox',
  DECLARATIONS: 'monitor.declarations',
  ZIP: 'monitor.zip',
  RPA_RESULT: 'rpa.result', // resposta dos robôs
} as const;

export const XmlJobs = {
  PLAN_DISTDFE: 'plan.distdfe',
  PLAN_NFSE: 'plan.nfse',
  PLAN_EXPORT: 'plan.export',
  DISTDFE: 'xml.distdfe',
  NFSE: 'xml.nfse',
  OUTBOUND: 'xml.outbound',
  EXPORT: 'xml.export',
} as const;

export const TaskJobs = { RECURRENCE: 'tasks.recurrence', FINE_STATUS: 'tasks.fine-status' } as const;
export const DriveJobs = { TRASH: 'drive.trash', CERTIFICATES: 'clients.certificates' } as const;
export const CommJobs = { PLAN_BROADCASTS: 'plan.broadcasts', BROADCAST: 'comm.broadcast', INACTIVITY: 'comm.inactivity' } as const;

export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

/** jobId idempotente (o BullMQ não aceita ':' em ids personalizados). */
export const jobKey = (...parts: (string | number)[]) => parts.join('__').replace(/[:\s]/g, '_');
