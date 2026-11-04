import { Injectable } from '@nestjs/common';
import { Agent, request } from 'undici';
import { isSandbox } from '../sandbox';
import { signXml } from '../xmldsig';
import { MANIFEST_EVENT_CODES } from './distdfe.client';

/**
 * Manifestação do destinatário (NFeRecepcaoEvento4 no Ambiente Nacional, cOrgao 91).
 * Evento assinado com o A1 do cliente destinatário.
 */
const URL_PROD = 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';
const URL_HOM = 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

const DESCRICAO: Record<keyof typeof MANIFEST_EVENT_CODES, string> = {
  CONFIRMACAO: 'Confirmacao da Operacao',
  CIENCIA: 'Ciencia da Operacao',
  DESCONHECIMENTO: 'Desconhecimento da Operacao',
  NAO_REALIZADA: 'Operacao nao Realizada',
};

@Injectable()
export class ManifestClient {
  buildEvent(p: { cnpj: string; accessKey: string; type: keyof typeof MANIFEST_EVENT_CODES; tpAmb: 1 | 2; justification?: string; when?: Date }) {
    const tp = MANIFEST_EVENT_CODES[p.type];
    const id = `ID${tp}${p.accessKey}01`;
    const dh = toBrasiliaIso(p.when ?? new Date());
    const xJust = p.type === 'NAO_REALIZADA' ? `<xJust>${(p.justification ?? 'Operacao nao realizada').slice(0, 255)}</xJust>` : '';
    return `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${Date.now()}</idLote><evento versao="1.00"><infEvento Id="${id}"><cOrgao>91</cOrgao><tpAmb>${p.tpAmb}</tpAmb><CNPJ>${p.cnpj}</CNPJ><chNFe>${p.accessKey}</chNFe><dhEvento>${dh}</dhEvento><tpEvento>${tp}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>${DESCRICAO[p.type]}</descEvento>${xJust}</detEvento></infEvento></evento></envEvento>`;
  }

  async send(p: { cnpj: string; accessKey: string; type: keyof typeof MANIFEST_EVENT_CODES; cert: { pfx: Buffer; passphrase: string }; justification?: string; tpAmb?: 1 | 2 }) {
    if (isSandbox()) return { cStat: '135', xMotivo: 'Evento registrado (sandbox)', protocol: `SBX${Date.now()}` };
    const tpAmb = p.tpAmb ?? 1;
    const signed = signXml(this.buildEvent({ ...p, tpAmb }), { pfx: p.cert.pfx, passphrase: p.cert.passphrase, referenceTag: 'infEvento', parentTag: 'evento' });
    const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${signed.replace(/^<\?xml[^>]*>/, '')}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
    const res = await request(tpAmb === 1 ? URL_PROD : URL_HOM, {
      method: 'POST',
      dispatcher: new Agent({ connect: { pfx: p.cert.pfx, passphrase: p.cert.passphrase } }),
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: envelope,
    });
    const xml = await res.body.text();
    const pick = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]).at(-1) ?? '';
    return { cStat: pick('cStat'), xMotivo: pick('xMotivo'), protocol: pick('nProt') };
  }
}

/** Data/hora no fuso de Brasília com offset (-03:00), exigido no dhEvento. */
export function toBrasiliaIso(d: Date) {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}
