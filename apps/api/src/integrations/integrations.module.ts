import { Global, Module } from '@nestjs/common';
import { IntegraContadorClient } from './serpro/integra-contador.client';
import { DistDfeClient } from './sefaz/distdfe.client';
import { ManifestClient } from './sefaz/manifest.client';
import { NfseNacionalClient } from './nfse/nfse-nacional.client';
import { AiGatewayService } from './ai/ai-gateway.service';
import { StorageService } from './storage/storage.service';
import { MailerService } from './mail/mailer.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { CnpjService } from './cnpj/cnpj.service';
import { CertificatesService } from './certificates.service';
import { DispatchService } from './dispatch.service';
import { NotificationsService } from './notifications.service';
import { PdfTextService } from './pdf-text.service';

const providers = [
  IntegraContadorClient,
  DistDfeClient,
  ManifestClient,
  NfseNacionalClient,
  AiGatewayService,
  StorageService,
  MailerService,
  WhatsappService,
  CnpjService,
  CertificatesService,
  DispatchService,
  NotificationsService,
  PdfTextService,
];

@Global()
@Module({ providers, exports: providers })
export class IntegrationsModule {}
