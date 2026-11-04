import { Injectable } from '@nestjs/common';
import { gunzipSync } from 'node:zlib';
import { Agent, request } from 'undici';
import { isSandbox } from '../sandbox';
import { sampleNfse } from '../sefaz/sample-xml';

/**
 * NFS-e Padrão Nacional.
 * - Distribuição (ADN): documentos em que o CNPJ é prestador ou tomador, por NSU, com mTLS do A1 do cliente.
 * - Emissão (Sefin Nacional): envio da DPS assinada → NFS-e. Usado pelo App+.
 * Municípios fora do padrão nacional precisam de adaptador próprio (interface NfseMunicipalPort).
 * Conferir rotas e versões na documentação técnica vigente do Portal Nacional da NFS-e.
 */

const ADN_BASE = process.env.NFSE_ADN_URL ?? 'https://adn.nfse.gov.br/contribuintes';
const SEFIN_BASE = process.env.NFSE_SEFIN_URL ?? 'https://sefin.nfse.gov.br/SefinNacional';

export interface NfseDistItem {
  nsu: number;
  chaveAcesso: string;
  tipoDocumento: string;
  xml: string;
}

@Injectable()
export class NfseNacionalClient {
  private agent(cert: { pfx: Buffer; passphrase: string }) {
    return new Agent({ connect: { pfx: cert.pfx, passphrase: cert.passphrase } });
  }

  async distribute(cert: { pfx: Buffer; passphrase: string }, cnpj: string, fromNsu: number, clientName = 'Cliente'): Promise<NfseDistItem[]> {
    if (isSandbox()) {
      if (fromNsu > 0) return [];
      return Array.from({ length: 8 }, (_, i) => {
        const direction = i % 3 === 0 ? 'TOMADO' : 'PRESTADO';
        const { accessKey, xml } = sampleNfse({ clientCnpj: cnpj, clientName, direction, n: 200 + i, issuedAt: new Date(Date.now() - (i * 9 + 1) * 86_400_000) });
        return { nsu: i + 1, chaveAcesso: accessKey, tipoDocumento: 'NFSE', xml };
      });
    }
    const res = await request(`${ADN_BASE}/DFe/${fromNsu}?cnpjConsulta=${cnpj}&lote=true`, {
      dispatcher: this.agent(cert),
      headers: { Accept: 'application/json' },
    });
    if (res.statusCode === 404) return [];
    const body = (await res.body.json()) as {
      LoteDFe?: { NSU: number; ChaveAcesso: string; TipoDocumento: string; ArquivoXml: string }[];
    };
    return (body.LoteDFe ?? []).map((d) => ({
      nsu: d.NSU,
      chaveAcesso: d.ChaveAcesso,
      tipoDocumento: d.TipoDocumento,
      xml: gunzipSync(Buffer.from(d.ArquivoXml, 'base64')).toString('utf8'),
    }));
  }

  /** Emite NFS-e a partir de uma DPS já assinada (XMLDSig) — gzip + base64 no corpo. */
  async issue(cert: { pfx: Buffer; passphrase: string }, signedDpsXml: string) {
    if (isSandbox()) return { accessKey: `SBX${Date.now()}`, xml: signedDpsXml };
    const { gzipSync } = await import('node:zlib');
    const res = await request(`${SEFIN_BASE}/nfse`, {
      method: 'POST',
      dispatcher: this.agent(cert),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(signedDpsXml)).toString('base64') }),
    });
    const body = (await res.body.json()) as { chaveAcesso?: string; nfseXmlGZipB64?: string; erros?: unknown };
    if (res.statusCode >= 400) throw new Error(`NFS-e rejeitada: ${JSON.stringify(body.erros ?? body)}`);
    return {
      accessKey: body.chaveAcesso!,
      xml: body.nfseXmlGZipB64 ? gunzipSync(Buffer.from(body.nfseXmlGZipB64, 'base64')).toString('utf8') : '',
    };
  }
}
