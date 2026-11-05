import { BadRequestException, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DEFAULT_CLIENT_FOLDERS, isTrashExpired, safeFileName } from '@produtiva/core';
import { PrismaService } from '../../common/prisma.service';
import { ClientCreatedEvent, Events } from '../../common/events';

@Injectable()
export class DriveService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cliente entrou na base → cria a pasta raiz e as subpastas padrão. */
  @OnEvent(Events.CLIENT_CREATED)
  async onClientCreated(e: ClientCreatedEvent) {
    const client = await this.prisma.clientCompany.findUniqueOrThrow({ where: { id: e.clientId } });
    const root = await this.prisma.folder.create({
      data: { tenantId: e.tenantId, clientId: e.clientId, kind: 'CLIENTE_RAIZ', name: client.tradeName ?? client.legalName },
    });
    for (const f of DEFAULT_CLIENT_FOLDERS) {
      await this.prisma.folder.create({
        data: {
          tenantId: e.tenantId,
          clientId: e.clientId,
          parentId: root.id,
          kind: (f as any).kind ?? 'CLIENTE_LIVRE',
          name: f.name,
          sharedWithClient: f.shared,
        },
      });
    }
    return root;
  }

  /** Garante a árvore de pastas de sistema (ex.: PGDAS/2026/10) e grava o arquivo nela. */
  async saveSystemFile(tenantId: string, clientId: string, path: string[], name: string, key: string, size: number, mime: string, shared = false) {
    let parent = await this.prisma.folder.findFirst({ where: { tenantId, clientId, kind: 'CLIENTE_RAIZ' } });
    if (!parent) parent = await this.onClientCreated({ tenantId, clientId, regime: '' });
    for (const segment of path) {
      const existing: typeof parent | null = await this.prisma.folder.findFirst({ where: { tenantId, clientId, parentId: parent!.id, name: segment, deletedAt: null } });
      parent = existing ?? (await this.prisma.folder.create({ data: { tenantId, clientId, parentId: parent!.id, kind: 'SISTEMA', name: segment, sharedWithClient: shared } }));
    }
    return this.prisma.file.create({ data: { folderId: parent!.id, name: safeFileName(name), key, size, mime, uploadedBy: 'system' } });
  }

  async list(tenantId: string, folderId: string | null, clientId?: string) {
    return this.prisma.folder.findMany({
      where: { tenantId, parentId: folderId, clientId: clientId ?? undefined, deletedAt: null },
      include: { files: { where: { deletedAt: null } } },
      orderBy: { name: 'asc' },
    });
  }

  async share(tenantId: string, folderId: string, shared: boolean, clientCanUpload: boolean) {
    const f = await this.prisma.folder.findFirstOrThrow({ where: { id: folderId, tenantId } });
    if (f.kind === 'ESCRITORIO') throw new BadRequestException('Pastas internas do escritório não podem ser compartilhadas.');
    return this.prisma.folder.update({ where: { id: folderId }, data: { sharedWithClient: shared, clientCanUpload: shared && clientCanUpload } });
  }

  /** Exclusão vai para a lixeira (20 dias). */
  trash(tenantId: string, fileId: string) {
    return this.prisma.file.updateMany({ where: { id: fileId, folder: { tenantId } }, data: { deletedAt: new Date() } });
  }

  restore(tenantId: string, fileId: string) {
    return this.prisma.file.updateMany({ where: { id: fileId, folder: { tenantId } }, data: { deletedAt: null } });
  }

  /** Job diário + botão "esvaziar lixeira". Retorna as chaves para apagar do S3. */
  async purge(tenantId: string, now = new Date(), force = false) {
    const trashed = await this.prisma.file.findMany({ where: { folder: { tenantId }, deletedAt: { not: null } } });
    const expired = trashed.filter((f) => force || isTrashExpired(f.deletedAt!, now));
    await this.prisma.file.deleteMany({ where: { id: { in: expired.map((f) => f.id) } } });
    return expired.map((f) => f.key);
  }
}
