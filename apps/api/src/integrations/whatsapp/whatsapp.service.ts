import { BadRequestException, Injectable } from '@nestjs/common';
import { SystemPrismaService } from '../../common/prisma.service';
import { VaultService } from '../../common/vault.service';
import { isSandbox, pushOutbox } from '../sandbox';
import { CloudApiProvider, QrCodeProvider, WhatsappProvider } from './whatsapp.provider';

/** Provedor que só registra na caixa de saída de desenvolvimento. */
class SandboxProvider implements WhatsappProvider {
  async sendText(to: string, body: string) {
    await pushOutbox({ channel: 'WHATSAPP', to, body });
    return { externalId: `sbx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
  sendDocument(to: string, url: string, filename: string, caption?: string) {
    return this.sendText(to, `[documento] ${filename} ${caption ?? ''} ${url}`);
  }
  sendTemplate(to: string, template: string, _lang: string, params: string[]) {
    return this.sendText(to, `[modelo ${template}] ${params.join(' | ')}`);
  }
}

/** Escolhe o provedor de WhatsApp do escritório (Cloud API oficial, QR Code ou sandbox). */
@Injectable()
export class WhatsappService {
  constructor(private readonly sys: SystemPrismaService, private readonly vault: VaultService) {}

  async forTenant(tenantId: string, numberId?: string | null): Promise<WhatsappProvider> {
    if (isSandbox()) return new SandboxProvider();
    const num = numberId ? await this.sys.whatsappNumber.findFirst({ where: { id: numberId, tenantId } }) : null;
    if (num?.provider === 'QRCODE') {
      return new QrCodeProvider(process.env.EVOLUTION_API_URL ?? '', num.phone, process.env.EVOLUTION_API_KEY ?? '');
    }
    const t = await this.sys.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!t.whatsappPhoneId || !t.whatsappTokenEnc) throw new BadRequestException('WhatsApp de disparo não configurado.');
    return new CloudApiProvider(t.whatsappPhoneId, this.vault.openString(t.whatsappTokenEnc));
  }
}
