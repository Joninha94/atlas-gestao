/** Histórico da tarefa: um registro por acontecimento (usuário, cliente ou sistema). */
export interface ProcessEventInput {
  tenantId: string;
  processId: string;
  kind: string;
  text: string;
  actorType?: 'USUARIO' | 'CLIENTE' | 'SISTEMA';
  actorId?: string | null;
  actorName?: string | null;
  meta?: Record<string, unknown>;
  at?: Date;
}

type Db = { processEvent: { create: (a: { data: any }) => Promise<unknown> } };

export function logEvent(db: Db, e: ProcessEventInput) {
  return db.processEvent
    .create({ data: { actorType: 'USUARIO', ...e, meta: (e.meta ?? undefined) as any } })
    .catch(() => undefined); // histórico nunca derruba a operação principal
}
