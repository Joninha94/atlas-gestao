import { BadRequestException, Body, Controller, Delete, Get, Module, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, PERMISSIONS, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { DriveService } from './drive.service';

@Controller('drive')
export class DriveController {
  constructor(private readonly drive: DriveService, private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  /**
   * Pastas de um nível. Sem parentId: `scope=office` → área de trabalho do escritório;
   * `clientId` → raiz do cliente; nada → raízes de todos os clientes.
   */
  @Get('folders')
  async list(@CurrentUser() u: AuthUser, @Query('parentId') parentId?: string, @Query('clientId') clientId?: string, @Query('scope') scope?: 'office' | 'clients') {
    if (parentId) return this.drive.list(u.tenantId, parentId);
    if (scope === 'office') return this.prisma.folder.findMany({ where: { parentId: null, kind: 'ESCRITORIO', deletedAt: null }, include: { files: { where: { deletedAt: null } } }, orderBy: { name: 'asc' } });
    return this.prisma.folder.findMany({
      where: { parentId: null, kind: 'CLIENTE_RAIZ', deletedAt: null, ...(clientId ? { clientId } : {}) },
      include: { files: { where: { deletedAt: null } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get('folders/:id')
  folder(@Param('id') id: string) {
    return this.prisma.folder.findFirstOrThrow({ where: { id, deletedAt: null }, include: { files: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } } });
  }

  @Get('folders/:id/path')
  async path(@Param('id') id: string) {
    const out: { id: string; name: string }[] = [];
    let cur = await this.prisma.folder.findFirst({ where: { id } });
    while (cur) {
      out.unshift({ id: cur.id, name: cur.name });
      cur = cur.parentId ? await this.prisma.folder.findFirst({ where: { id: cur.parentId } }) : null;
    }
    return out;
  }

  @Post('folders')
  async create(@CurrentUser() u: AuthUser, @Body() b: { name: string; parentId?: string }) {
    if (!b.name?.trim()) throw new BadRequestException('Informe o nome da pasta.');
    const parent = b.parentId ? await this.prisma.folder.findFirstOrThrow({ where: { id: b.parentId } }) : null;
    return this.prisma.folder.create({
      data: {
        tenantId: u.tenantId,
        parentId: parent?.id,
        clientId: parent?.clientId,
        kind: parent?.clientId ? 'CLIENTE_LIVRE' : 'ESCRITORIO',
        name: b.name.trim().slice(0, 120),
      },
    });
  }

  @Delete('folders/:id')
  async removeFolder(@Param('id') id: string) {
    const f = await this.prisma.folder.findFirstOrThrow({ where: { id } });
    if (['CLIENTE_RAIZ', 'SISTEMA', 'WHATSAPP'].includes(f.kind)) throw new BadRequestException('Pastas automáticas não podem ser excluídas.');
    await this.prisma.file.updateMany({ where: { folderId: id }, data: { deletedAt: new Date() } });
    return this.prisma.folder.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  @Post('folders/:id/share')
  @RequirePermission(PERMISSIONS.DRIVE_SHARE)
  share(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { shared: boolean; clientCanUpload?: boolean }) {
    return this.drive.share(u.tenantId, id, b.shared, !!b.clientCanUpload);
  }

  @Delete('files/:id')
  trash(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.drive.trash(u.tenantId, id);
  }

  @Post('files/:id/restore')
  restore(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.drive.restore(u.tenantId, id);
  }

  @Get('trash')
  trashList() {
    return this.prisma.file.findMany({ where: { deletedAt: { not: null } }, include: { folder: { select: { name: true } } }, orderBy: { deletedAt: 'desc' }, take: 500 });
  }

  /** Esvazia a lixeira agora (normalmente apaga sozinho após 20 dias). */
  @Post('trash/empty')
  async empty(@CurrentUser() u: AuthUser) {
    const keys = await this.drive.purge(u.tenantId, new Date(), true);
    for (const k of keys) await this.storage.remove(k).catch(() => undefined);
    return { removed: keys.length };
  }
}

@Module({
  controllers: [DriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
