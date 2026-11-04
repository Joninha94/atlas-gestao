import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VaultService } from '../common/vault.service';
import { isSandbox } from './sandbox';

/** Fornece certificados decifrados SOMENTE em memória, para o worker que vai assinar/autenticar. */
@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService, private readonly vault: VaultService) {}

  async office(tenantId: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: { tenantId, owner: 'ESCRITORIO', validTo: { gt: new Date() } },
      orderBy: { validTo: 'desc' },
    });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!cert && isSandbox()) return { cnpj: tenant.cnpj, pfx: Buffer.alloc(0), passphrase: '' };
    if (!cert) throw new NotFoundException('Escritório sem certificado digital válido cadastrado.');
    return {
      cnpj: tenant.cnpj,
      pfx: this.vault.open(Buffer.from(cert.pfxEnc), cert.dekEnc),
      passphrase: this.vault.openString(cert.passwordEnc),
    };
  }

  async client(clientId: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: { clientId, owner: 'CLIENTE', validTo: { gt: new Date() } },
      orderBy: { validTo: 'desc' },
    });
    if (!cert) return isSandbox() ? { pfx: Buffer.alloc(0), passphrase: '' } : null;
    return {
      pfx: this.vault.open(Buffer.from(cert.pfxEnc), cert.dekEnc),
      passphrase: this.vault.openString(cert.passwordEnc),
    };
  }
}
