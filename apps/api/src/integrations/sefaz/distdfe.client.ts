import { Injectable } from '@nestjs/common';
import { gunzipSync } from 'node:zlib';
import { gzipSync } from 'node:zlib';
import { Agent, request } from 'undici';
import { isSandbox } from '../sandbox';
import { sampleNfe } from './sample-xml';

/**
 * NFeDistribuicaoDFe (Ambiente Nacional) — distribui NF-e e eventos em que o CNPJ é destinatário
 * (notas de ENTRADA) e também CT-e pela distribuição própria do CT-e.
 * Autenticação mTLS com o certificado A1 do CLIENTE.
 *
 * Regras do serviço:
 * - cStat 138: há documentos; cStat 137: nenhum documento (aguardar 1 h antes de nova consulta);
 * - cStat 656: consumo indevido (bloqueio temporário) — respeitar `nextAllowedAt`.
 * - Avançar pelo ultNSU até alcançar maxNSU.
 */

export const DISTDFE_URL = {
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
};

export interface DistDocument {
  nsu: string;
  schema: string; // resNFe_v1.01.xsd | procNFe_v4.00.xsd | resEvento...
  xml: string;
}

export interface DistResult {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  docs: DistDocument[];
}

@Injectable()
export class DistDfeClient {
  buildEnvelope(params: { cnpj: string; ufAutor: string; ultNSU: string; tpAmb: 1 | 2 }): string {
    const cUF = UF_CODES[params.ufAutor] ?? '91';
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
<soap12:Body>
<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
<nfeDadosMsg>
<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
<tpAmb>${params.tpAmb}</tpAmb>
<cUFAutor>${cUF}</cUFAutor>
<CNPJ>${params.cnpj}</CNPJ>
<distNSU><ultNSU>${params.ultNSU.padStart(15, '0')}</ultNSU></distNSU>
</distDFeInt>
</nfeDadosMsg>
</nfeDistDFeInteresse>
</soap12:Body>
</soap12:Envelope>`;
  }

  async fetch(params: {
    cnpj: string;
    ufAutor: string;
    ultNSU: string;
    cert: { pfx: Buffer; passphrase: string };
    tpAmb?: 1 | 2;
    clientName?: string;
  }): Promise<DistResult> {
    if (isSandbox()) return this.sandbox(params.cnpj, params.clientName ?? 'Cliente', Number(params.ultNSU));
    const tpAmb = params.tpAmb ?? 1;
    const dispatcher = new Agent({ connect: { pfx: params.cert.pfx, passphrase: params.cert.passphrase } });
    const res = await request(tpAmb === 1 ? DISTDFE_URL.producao : DISTDFE_URL.homologacao, {
      method: 'POST',
      dispatcher,
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: this.buildEnvelope({ ...params, tpAmb }),
    });
    return this.parse(await res.body.text());
  }

  /** Sandbox: na primeira consulta entrega 12 NF-e de entrada dos últimos 3 meses; depois, nada novo (137). */
  private sandbox(cnpj: string, name: string, ult: number): DistResult {
    if (ult > 0) return { cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: String(ult), maxNSU: String(ult), docs: [] };
    const docs = Array.from({ length: 12 }, (_, i) => {
      const issuedAt = new Date(Date.now() - (i * 7 + 2) * 86_400_000);
      const { xml } = sampleNfe({ clientCnpj: cnpj, clientName: name, direction: 'ENTRADA', n: 1000 + i, issuedAt });
      return { nsu: String(i + 1), schema: 'procNFe_v4.00.xsd', xml };
    });
    const zipped = docs.map((d) => `<docZip NSU="${d.nsu.padStart(15, '0')}" schema="${d.schema}">${gzipSync(d.xml).toString('base64')}</docZip>`).join('');
    return this.parse(`<retDistDFeInt><cStat>138</cStat><xMotivo>Documento localizado</xMotivo><ultNSU>12</ultNSU><maxNSU>12</maxNSU><loteDistDFeInt>${zipped}</loteDistDFeInt></retDistDFeInt>`);
  }

  /** Parser mínimo por regex (o retorno tem estrutura fixa); docZip = base64 de gzip. */
  parse(xml: string): DistResult {
    const pick = (tag: string) => xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '';
    const docs: DistDocument[] = [];
    const re = /<docZip NSU="(\d+)" schema="([^"]+)">([^<]+)<\/docZip>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      docs.push({ nsu: m[1], schema: m[2], xml: gunzipSync(Buffer.from(m[3], 'base64')).toString('utf8') });
    }
    return { cStat: pick('cStat'), xMotivo: pick('xMotivo'), ultNSU: pick('ultNSU'), maxNSU: pick('maxNSU'), docs };
  }
}

/** Manifestação do destinatário (RecepcaoEvento, tpEvento 210200/210210/210220/210240). */
export const MANIFEST_EVENT_CODES = {
  CONFIRMACAO: '210200',
  CIENCIA: '210210',
  DESCONHECIMENTO: '210220',
  NAO_REALIZADA: '210240',
} as const;

export const UF_CODES: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};
