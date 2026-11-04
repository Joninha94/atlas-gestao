import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../../integrations/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { Events } from '../../common/events';
import { IntegraContadorClient, SERPRO_SERVICES } from '../../integrations/serpro/integra-contador.client';
import { CertificatesService } from '../../integrations/certificates.service';

/** Rotinas de sincronização periódica: comprovantes, caixa postal, declarações e situação fiscal. */
@Injectable()
export class MonitorSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serpro: IntegraContadorClient,
    private readonly certs: CertificatesService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  private async ctx(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId } });
    const o = await this.certs.office(tenantId);
    return {
      client,
      cert: { pfx: o.pfx, passphrase: o.passphrase },
      office: { numero: o.cnpj, tipo: 2 as const },
      taxpayer: { numero: client.document, tipo: (client.document.length === 14 ? 2 : 1) as 1 | 2 },
    };
  }

  /** Comprovantes de arrecadação → baixa automática das guias pagas. */
  async syncReceipts(tenantId: string, clientId: string) {
    const c = await this.ctx(tenantId, clientId);
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const res = await this.serpro.call<{ numeroDocumento: string; dataArrecadacao: string; valorTotal: number; codigoReceita?: string; periodoApuracao?: string }[]>(
      c.cert, SERPRO_SERVICES.PAGTOWEB_CONSULTAR, c.office, c.taxpayer,
      { intervaloDataArrecadacao: { dataInicial: since, dataFinal: new Date().toISOString().slice(0, 10) }, primeiroDaPagina: 0, tamanhoDaPagina: 100 },
    );
    let paid = 0;
    for (const p of res.dados ?? []) {
      await this.prisma.paymentReceipt.upsert({
        where: { clientId_docNumber: { clientId, docNumber: p.numeroDocumento } },
        create: { tenantId, clientId, docNumber: p.numeroDocumento, paidAt: new Date(p.dataArrecadacao), amount: p.valorTotal, revenueCode: p.codigoReceita, breakdown: p as any },
        update: {},
      });
      // Casa comprovante ↔ guia pela competência e valor (tolerância de centavos)
      const competence = p.periodoApuracao ? `${p.periodoApuracao.slice(0, 4)}-${p.periodoApuracao.slice(4, 6)}` : undefined;
      const guide = await this.prisma.fiscalGuide.findFirst({
        where: { clientId, competence, status: { notIn: ['PAGA', 'CANCELADA'] }, total: { gte: p.valorTotal - 0.05, lte: p.valorTotal + 0.05 } },
      });
      if (guide) {
        await this.prisma.fiscalGuide.update({ where: { id: guide.id }, data: { status: 'PAGA', paidAt: new Date(p.dataArrecadacao) } });
        this.events.emit(Events.GUIDE_PAID, { tenantId, clientId, guideId: guide.id });
        paid++;
      }
    }
    return { receipts: res.dados?.length ?? 0, guidesPaid: paid };
  }

  /** Caixa postal e-CAC: só LISTA. Ciência apenas quando um usuário abre (MonitorService.openMailboxMessage). */
  async syncMailbox(tenantId: string, clientId: string) {
    const c = await this.ctx(tenantId, clientId);
    const res = await this.serpro.call<{ conteudo?: { isn: string; assuntoModelo: string; remetente?: string; dataEnvio: string; indicadorLeitura: string; relevancia?: string }[] }>(
      c.cert, SERPRO_SERVICES.CAIXAPOSTAL_LISTAR, c.office, c.taxpayer, {},
    );
    for (const m of res.dados?.conteudo ?? []) {
      await this.prisma.mailboxMessage.upsert({
        where: { clientId_source_externalId: { clientId, source: 'ECAC', externalId: m.isn } },
        create: {
          tenantId, clientId, source: 'ECAC', externalId: m.isn, subject: m.assuntoModelo, sender: m.remetente,
          receivedAt: new Date(m.dataEnvio), isRead: m.indicadorLeitura === '1', relevance: m.relevancia,
        },
        update: { isRead: m.indicadorLeitura === '1' },
      });
    }
    return { messages: res.dados?.conteudo?.length ?? 0 };
  }

  /** Ausência de declarações nos últimos 5 anos (DEFIS/DIRF) e meses recentes (PGDAS-D/DCTFWeb). */
  async checkDeclarations(tenantId: string, clientId: string) {
    const missing = await this.prisma.declaration.findMany({ where: { tenantId, clientId, status: 'AUSENTE' } });
    for (const d of missing) this.events.emit(Events.DECLARATION_MISSING, { tenantId, clientId, type: d.type, period: d.period });
    if (missing.length) {
      await this.notifications.notify({
        tenantId, clientId, kind: 'DECLARACAO_AUSENTE',
        title: `${missing.length} declaração(ões) ausente(s)`, body: missing.map((d) => `${d.type} ${d.period}`).join(', '), link: `/clientes/${clientId}`,
      });
    }
    return { missing: missing.length };
  }
}
