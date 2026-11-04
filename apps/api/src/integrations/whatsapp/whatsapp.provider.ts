import { Injectable } from '@nestjs/common';
import { request } from 'undici';

/**
 * Porta de WhatsApp. Duas implementações:
 * - CloudApiProvider (recomendado): API oficial da Meta, webhooks de mensagens e status (sent/delivered/read).
 * - QrCodeProvider: via Evolution API/Baileys para quem exige "escanear QR Code". Viola os termos do
 *   WhatsApp e pode banir o número — só habilitar com aceite explícito do escritório.
 */
export interface WhatsappProvider {
  sendText(to: string, body: string): Promise<{ externalId: string }>;
  sendDocument(to: string, url: string, filename: string, caption?: string): Promise<{ externalId: string }>;
  sendTemplate(to: string, template: string, lang: string, params: string[]): Promise<{ externalId: string }>;
}

@Injectable()
export class CloudApiProvider implements WhatsappProvider {
  private readonly version = process.env.WHATSAPP_GRAPH_VERSION ?? 'v21.0';

  constructor(private readonly phoneNumberId: string, private readonly token: string) {}

  private async post(payload: Record<string, unknown>) {
    const res = await request(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const body = (await res.body.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (res.statusCode >= 400) throw new Error(`WhatsApp: ${body.error?.message ?? res.statusCode}`);
    return { externalId: body.messages?.[0]?.id ?? '' };
  }

  sendText(to: string, body: string) {
    return this.post({ to, type: 'text', text: { body } });
  }

  sendDocument(to: string, url: string, filename: string, caption?: string) {
    return this.post({ to, type: 'document', document: { link: url, filename, caption } });
  }

  /** Fora da janela de 24 h, só modelos aprovados podem iniciar conversa (ex.: aviso de guia). */
  sendTemplate(to: string, template: string, lang: string, params: string[]) {
    return this.post({
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: lang },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    });
  }
}

@Injectable()
export class QrCodeProvider implements WhatsappProvider {
  constructor(private readonly baseUrl: string, private readonly instance: string, private readonly apiKey: string) {}

  private async post(path: string, payload: Record<string, unknown>) {
    const res = await request(`${this.baseUrl}${path}/${this.instance}`, {
      method: 'POST',
      headers: { apikey: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.body.json()) as { key?: { id: string } };
    return { externalId: body.key?.id ?? '' };
  }

  sendText(to: string, text: string) {
    return this.post('/message/sendText', { number: to, text });
  }

  sendDocument(to: string, url: string, fileName: string, caption?: string) {
    return this.post('/message/sendMedia', { number: to, mediatype: 'document', media: url, fileName, caption });
  }

  sendTemplate(to: string, _t: string, _l: string, params: string[]) {
    return this.sendText(to, params.join('\n'));
  }
}
