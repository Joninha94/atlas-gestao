import {
  BadRequestException, Controller, ForbiddenException, Get, Module, Param, Post, Query, Res, UploadedFiles, UseInterceptors, Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { safeFileName } from '@produtiva/core';
import { AuthUser, ClientRoute, CurrentUser, Public } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { PdfTextService } from '../../integrations/pdf-text.service';

const MAX_MB = 25;
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp)|text\/(plain|csv|xml)|application\/(xml|zip|vnd\.openxmlformats-officedocument\..+|msword|vnd\.ms-excel))$/;
const upload = FilesInterceptor('files', 50, { limits: { fileSize: MAX_MB * 1024 * 1024 } });

export interface UploadedRef {
  fileKey: string;
  fileName: string;
  size: number;
  mime: string;
  text?: string;
  fileId?: string;
}

/**
 * Upload de arquivos (painel e app). Guarda no armazenamento, extrai texto de PDF
 * e, se `folderId` vier, registra no Drive. Antivírus: plugar ClamAV aqui antes do `put`.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService, private readonly pdf: PdfTextService, private readonly prisma: PrismaService) {}

  @Post()
  @UseInterceptors(upload)
  async upload(@CurrentUser() u: AuthUser, @UploadedFiles() files: Express.Multer.File[], @Body() b: { folderId?: string; withText?: string }) {
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.');
    const folder = b.folderId ? await this.prisma.folder.findFirst({ where: { id: b.folderId, deletedAt: null } }) : null;
    if (b.folderId && !folder) throw new BadRequestException('Pasta não encontrada.');
    const out: UploadedRef[] = [];
    for (const f of files) {
      if (!ALLOWED.test(f.mimetype)) throw new BadRequestException(`Tipo não permitido: ${f.originalname}`);
      const name = safeFileName(Buffer.from(f.originalname, 'latin1').toString('utf8'));
      const key = this.storage.key(u.tenantId, 'uploads', new Date().toISOString().slice(0, 7), `${randomUUID()}_${name}`);
      await this.storage.put(key, f.buffer, f.mimetype);
      const ref: UploadedRef = { fileKey: key, fileName: name, size: f.size, mime: f.mimetype };
      if (b.withText !== 'false') ref.text = await this.pdf.extract(f.buffer, f.mimetype);
      if (folder) {
        const row = await this.prisma.file.create({ data: { folderId: folder.id, name, key, size: f.size, mime: f.mimetype, uploadedBy: u.sub } });
        ref.fileId = row.id;
      }
      out.push(ref);
    }
    return out;
  }

  /** URL assinada para um arquivo do Drive (painel). */
  @Get(':id/url')
  async url(@Param('id') id: string) {
    const f = await this.prisma.file.findFirstOrThrow({ where: { id, folder: { deletedAt: null } } });
    return { url: await this.storage.signedUrl(f.key, 300, f.name) };
  }

  /** Download com URL assinada (driver local). O S3 entrega direto pela URL pré-assinada. */
  @Public()
  @Get('download')
  async download(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Query('name') name: string | undefined, @Res() res: Response) {
    if (!key || !this.storage.verifyLocal(key, Number(exp), sig ?? '')) throw new ForbiddenException('Link expirado ou inválido.');
    const buf = await this.storage.get(key);
    const fileName = name ?? key.split('/').pop()!;
    res.setHeader('Content-Type', guessMime(fileName));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buf);
  }
}

/** Upload pelo app do cliente: só para pastas compartilhadas com permissão de envio, ou anexos de OS. */
@Controller('app/files')
export class ClientFilesController {
  constructor(private readonly storage: StorageService, private readonly prisma: PrismaService) {}

  @ClientRoute()
  @Post()
  @UseInterceptors(upload)
  async upload(@CurrentUser() u: AuthUser, @UploadedFiles() files: Express.Multer.File[], @Body() b: { folderId?: string }) {
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.');
    const folder = b.folderId
      ? await this.prisma.folder.findFirst({ where: { id: b.folderId, clientId: u.clientId, sharedWithClient: true, clientCanUpload: true, deletedAt: null } })
      : null;
    if (b.folderId && !folder) throw new ForbiddenException('Pasta somente leitura.');
    const out: UploadedRef[] = [];
    for (const f of files) {
      if (!ALLOWED.test(f.mimetype)) throw new BadRequestException(`Tipo não permitido: ${f.originalname}`);
      const name = safeFileName(Buffer.from(f.originalname, 'latin1').toString('utf8'));
      const key = this.storage.key(u.tenantId, 'clientes', u.clientId!, `${randomUUID()}_${name}`);
      await this.storage.put(key, f.buffer, f.mimetype);
      const ref: UploadedRef = { fileKey: key, fileName: name, size: f.size, mime: f.mimetype };
      if (folder) ref.fileId = (await this.prisma.file.create({ data: { folderId: folder.id, name, key, size: f.size, mime: f.mimetype, uploadedBy: `client:${u.sub}` } })).id;
      out.push(ref);
    }
    return out;
  }
}

function guessMime(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ pdf: 'application/pdf', xml: 'application/xml', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}

@Module({ controllers: [FilesController, ClientFilesController] })
export class FilesModule {}
