import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cofre de segredos (certificados A1, senhas, tokens).
 * Criptografia em envelope: cada segredo tem sua própria chave de dados (DEK, AES-256-GCM);
 * a DEK é cifrada pela chave mestra (KEK). Em produção a KEK fica no KMS (AWS KMS / GCP KMS)
 * e `wrapKey/unwrapKey` chamam o KMS; aqui, para desenvolvimento, vem de VAULT_MASTER_KEY.
 * Nunca logar valores decifrados e nunca enviá-los à IA.
 */
@Injectable()
export class VaultService {
  private readonly kek: Buffer;

  constructor() {
    const hex = process.env.VAULT_MASTER_KEY ?? '';
    if (hex.length !== 64) throw new Error('VAULT_MASTER_KEY deve ter 32 bytes em hex (64 caracteres).');
    this.kek = Buffer.from(hex, 'hex');
  }

  seal(plain: Buffer): { ciphertext: Buffer; dekEnc: string } {
    const dek = randomBytes(32);
    return { ciphertext: this.encrypt(plain, dek), dekEnc: this.encrypt(dek, this.kek).toString('base64') };
  }

  open(ciphertext: Buffer, dekEnc: string): Buffer {
    const dek = this.decrypt(Buffer.from(dekEnc, 'base64'), this.kek);
    return this.decrypt(ciphertext, dek);
  }

  sealString(value: string): string {
    const { ciphertext, dekEnc } = this.seal(Buffer.from(value, 'utf8'));
    return `${dekEnc}.${ciphertext.toString('base64')}`;
  }

  openString(sealed: string): string {
    const [dekEnc, ct] = sealed.split('.');
    return this.open(Buffer.from(ct, 'base64'), dekEnc).toString('utf8');
  }

  private encrypt(plain: Buffer, key: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  private decrypt(data: Buffer, key: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  }
}
