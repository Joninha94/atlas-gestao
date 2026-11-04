import { Injectable, NotFoundException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Armazenamento de arquivos com dois drivers:
 *  - s3    (produção; MinIO em dev com docker): URLs pré-assinadas do próprio S3.
 *  - local (STORAGE_DRIVER=local): disco em STORAGE_DIR, servido por GET /files/download com URL assinada (HMAC).
 * Chaves sempre começam pelo tenantId.
 */
@Injectable()
export class StorageService {
  private readonly driver = process.env.STORAGE_DRIVER ?? 's3';
  private readonly dir = path.resolve(process.env.STORAGE_DIR ?? './.storage');
  private readonly bucket = process.env.S3_BUCKET ?? 'produtiva';
  private readonly s3 =
    this.driver === 's3'
      ? new S3Client({ region: process.env.S3_REGION ?? 'us-east-1', endpoint: process.env.S3_ENDPOINT, forcePathStyle: !!process.env.S3_ENDPOINT })
      : undefined;

  key(tenantId: string, ...parts: string[]) {
    return [tenantId, ...parts].join('/');
  }

  private localPath(key: string) {
    const p = path.resolve(this.dir, key);
    if (!p.startsWith(this.dir + path.sep)) throw new NotFoundException();
    return p;
  }

  async put(key: string, body: Buffer | string, contentType: string) {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' }));
    } else {
      const p = this.localPath(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, body);
    }
    return key;
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    return fs.readFile(this.localPath(key)).catch(() => {
      throw new NotFoundException('Arquivo não encontrado.');
    });
  }

  async remove(key: string) {
    if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    else await fs.rm(this.localPath(key), { force: true });
  }

  /** URL de curta duração para baixar/enviar por WhatsApp. */
  async signedUrl(key: string, seconds = 300, fileName?: string) {
    if (this.s3) return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: seconds });
    const exp = Math.floor(Date.now() / 1000) + seconds;
    const sig = this.sign(key, exp);
    const q = new URLSearchParams({ key, exp: String(exp), sig, ...(fileName ? { name: fileName } : {}) });
    return `${process.env.PUBLIC_API_URL ?? ''}/files/download?${q}`;
  }

  verifyLocal(key: string, exp: number, sig: string) {
    if (exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const got = Buffer.from(sig);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }

  private sign(key: string, exp: number) {
    return createHmac('sha256', process.env.JWT_SECRET ?? '').update(`${key}:${exp}`).digest('base64url');
  }
}
