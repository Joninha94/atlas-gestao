/**
 * Eventos de domínio trocados entre módulos (via @nestjs/event-emitter dentro do processo;
 * workers publicam pelo outbox e um relay reemite aqui).
 */
export const Events = {
  CLIENT_CREATED: 'client.created',
  GUIDE_DISPATCHED: 'guide.dispatched',
  GUIDE_PAID: 'guide.paid',
  GUIDE_VIEWED: 'guide.viewed',
  DECLARATION_MISSING: 'declaration.missing',
  SERVICE_FORM_SUBMITTED: 'serviceForm.submitted',
  MESSAGE_RECEIVED: 'message.received',
  DOCUMENT_DROPPED: 'document.dropped',
  CERTIFICATE_EXPIRING: 'certificate.expiring',
} as const;

export interface ClientCreatedEvent {
  tenantId: string;
  clientId: string;
  regime: string;
}

export interface GuideDispatchedEvent {
  tenantId: string;
  clientId: string;
  guideId: string;
  routine: string; // SIMPLES | MEI | DCTFWEB | FGTS | PARCELAMENTOS
  competence: string;
}

export interface MessageReceivedEvent {
  tenantId: string;
  conversationId: string;
  messageId: string;
  text?: string;
  mediaKey?: string;
}

export interface ServiceFormSubmittedEvent {
  tenantId: string;
  orderId: string;
  clientId: string;
  formId: string;
}
