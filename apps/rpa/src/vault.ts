import { createDecipheriv } from 'node:crypto';

/** Abre segredos selados pelo VaultService da API (envelope AES-256-GCM). Só leitura. */
const kek = () => {
  const hex = process.env.VAULT_MASTER_KEY ?? '';
  if (hex.length !== 64) throw new Error('VAULT_MASTER_KEY ausente/inválida');
  return Buffer.from(hex, 'hex');
};
const decrypt = (data: Buffer, key: Buffer) => {
  const d = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]);
};
export const open = (ciphertext: Buffer, dekEnc: string) => decrypt(ciphertext, decrypt(Buffer.from(dekEnc, 'base64'), kek()));
export const openString = (sealed: string) => {
  const [dekEnc, ct] = sealed.split('.');
  return open(Buffer.from(ct, 'base64'), dekEnc).toString('utf8');
};
