import { Controller, Get, Injectable, NotFoundException, Param, Res } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Response } from 'express';
import { Public } from '../../common/auth';
import { SystemPrismaService } from '../../common/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { logEvent } from './process-events';

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const CANAL: Record<string, string> = { EMAIL: 'e-mail', WHATSAPP: 'WhatsApp', APP: 'aplicativo' };

/** Registra no histórico da tarefa: recebeu (abriu), leu, baixou — com dia, hora e quem. */
@Injectable()
export class DeliveryTrackingService {
  constructor(private readonly sys: SystemPrismaService, private readonly storage: StorageService) {}

  async link(token: string) {
    const l = await this.sys.deliveryLink.findUnique({ where: { token } });
    if (!l) throw new NotFoundException('Link inválido ou expirado.');
    const d = await this.sys.deliveryNote.findUniqueOrThrow({ where: { id: l.deliveryId }, include: { process: { select: { title: true, competence: true } } } });
    return { l, d };
  }

  who(l: { contactName: string | null; recipient: string; channel: string }) {
    return l.channel === 'APP' ? (l.contactName ?? 'Cliente') : `${l.contactName ?? 'Cliente'} (${l.recipient})`;
  }

  /** E-mail aberto / página da entrega aberta: "recebeu". Registra só a primeira vez. */
  async opened(token: string, how: 'pixel' | 'pagina' | 'app') {
    const { l } = await this.link(token);
    if (l.openedAt) return l;
    await this.sys.deliveryLink.update({ where: { token }, data: { openedAt: new Date() } });
    const text = how === 'pixel' ? `${this.who(l)} abriu o e-mail da entrega` : how === 'app' ? `${this.who(l)} abriu a entrega no aplicativo` : `${this.who(l)} abriu a página da entrega (${CANAL[l.channel]})`;
    await logEvent(this.sys, { tenantId: l.tenantId, processId: l.processId, kind: 'RECEBIDO', actorType: 'CLIENTE', actorName: l.contactName, text, meta: { channel: l.channel, to: l.recipient } });
    await this.sys.deliveryNote.updateMany({ where: { id: l.deliveryId, viewedAt: null }, data: { viewedAt: new Date() } });
    return l;
  }

  /** Download de um arquivo (índice) ou do protocolo ('p'): grava quem baixou e devolve o link assinado. */
  async download(token: string, which: string) {
    const { l, d } = await this.link(token);
    const files = d.files as { name: string; key: string }[];
    const nro = String(d.number).padStart(6, '0');
    const file = which === 'p' ? (d.pdfKey ? { name: `Protocolo_${nro}.pdf`, key: d.pdfKey } : null) : files[Number(which)];
    if (!file) throw new NotFoundException('Arquivo não encontrado.');
    if (!l.openedAt) await this.sys.deliveryLink.update({ where: { token }, data: { openedAt: new Date() } });
    await this.sys.deliveryNote.updateMany({ where: { id: l.deliveryId, viewedAt: null }, data: { viewedAt: new Date() } });
    await logEvent(this.sys, { tenantId: l.tenantId, processId: l.processId, kind: 'BAIXADO', actorType: 'CLIENTE', actorName: l.contactName, text: `${this.who(l)} baixou ${file.name} (${CANAL[l.channel]})`, meta: { channel: l.channel, file: file.name } });
    return this.storage.signedUrl(file.key, 300, file.name);
  }

  /** Status do WhatsApp (webhook da Meta): entregue / lido. */
  @OnEvent('whatsapp.status')
  onStatus(e: { externalId: string; status: string; at: Date }) {
    return this.whatsappStatus(e.externalId, e.status, e.at).catch(() => undefined);
  }

  async whatsappStatus(externalId: string, status: string, at: Date) {
    if (status !== 'delivered' && status !== 'read') return;
    const l = await this.sys.deliveryLink.findFirst({ where: { externalIds: { has: externalId } } });
    if (!l) return;
    // só o primeiro "entregue" e o primeiro "lido" de cada destinatário
    const kind = status === 'read' ? 'LIDO' : 'RECEBIDO';
    const dup = await this.sys.processEvent.findFirst({ where: { processId: l.processId, kind, meta: { path: ['token'], equals: l.token } } });
    if (dup) return;
    await logEvent(this.sys, {
      tenantId: l.tenantId, processId: l.processId, kind, actorType: 'CLIENTE', actorName: l.contactName, at,
      text: status === 'read' ? `${this.who(l)} leu no WhatsApp` : `WhatsApp entregue para ${this.who(l)}`, meta: { channel: 'WHATSAPP', token: l.token },
    });
  }
}

/** Links públicos da nota de envio: /d/:token (página), /d/:token.gif (pixel), /d/:token/:arquivo (download). */
@Controller('d')
export class DeliveryTrackingController {
  constructor(private readonly track: DeliveryTrackingService) {}

  @Public()
  @Get(':token')
  async page(@Param('token') token: string, @Res() res: Response) {
    if (token.endsWith('.gif')) {
      await this.track.opened(token.replace(/\.gif$/, ''), 'pixel').catch(() => undefined);
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(PIXEL);
    }
    const { d } = await this.track.link(token);
    await this.track.opened(token, 'pagina');
    const files = d.files as { name: string }[];
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const nro = String(d.number).padStart(6, '0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrega nº ${nro}</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f8f8;color:#0f172a;margin:0;padding:24px}main{max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px}
h1{font-size:18px;margin:0 0 4px}p{color:#475569;margin:4px 0 14px}a.f{display:block;padding:12px;border:1px solid #e2e8f0;border-radius:8px;margin:8px 0;color:#0f4c47;text-decoration:none;font-weight:600}a.f:hover{background:#e6f4f2}.m{background:#dcf8c6;border-radius:10px;padding:10px 12px;color:#0f172a}</style></head>
<body><main><h1>${esc(d.process.title)}</h1><p>Competência ${esc(d.process.competence.split('-').reverse().join('/'))} · protocolo nº ${nro}</p>
${d.message ? `<div class="m">${esc(d.message)}</div>` : ''}
${files.map((f, i) => `<a class="f" href="${i}">📄 ${esc(f.name)}</a>`).join('')}
${d.pdfKey ? `<a class="f" href="p">🧾 Protocolo de entrega nº ${nro}</a>` : ''}</main></body></html>`.replace(/href="(\d+|p)"/g, `href="${token}/$1"`));
  }

  @Public()
  @Get(':token/:which')
  async file(@Param('token') token: string, @Param('which') which: string, @Res() res: Response) {
    return res.redirect(await this.track.download(token, which));
  }
}
