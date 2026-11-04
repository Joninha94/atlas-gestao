import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CertificatesService } from '../../integrations/certificates.service';
import { NfseNacionalClient } from '../../integrations/nfse/nfse-nacional.client';
import { toBrasiliaIso } from '../../integrations/sefaz/manifest.client';
import { isSandbox } from '../../integrations/sandbox';
import { selfSignedPfx, signXml } from '../../integrations/xmldsig';
import { XmlService } from '../xml/xml.service';

/**
 * Emissão de NFS-e pelo App+ (padrão nacional): monta a DPS, assina com o A1 do cliente,
 * envia à Sefin Nacional e grava a nota como PRESTADO.
 * Leiaute da DPS conforme Nota Técnica da NFS-e Nacional — conferir versão vigente antes de produção.
 */
@Injectable()
export class NfseIssuerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certs: CertificatesService,
    private readonly nfse: NfseNacionalClient,
    private readonly xml: XmlService,
  ) {}

  async issue(clientId: string, input: { takerId: string; amount: number; description: string; competence?: string }) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId } });
    if (!client.appPlus) throw new ForbiddenException('Emissão de NFS-e disponível no App+.');
    const cfg = await this.prisma.nfseIssuerConfig.findUnique({ where: { clientId } });
    if (!cfg) throw new BadRequestException('O escritório ainda não configurou os dados de emissão desta empresa.');
    const taker = await this.prisma.nfseTaker.findFirstOrThrow({ where: { id: input.takerId, clientId } });
    if (!(input.amount > 0)) throw new BadRequestException('Valor inválido.');
    if (!client.ibgeCity) throw new BadRequestException('Município (código IBGE) do prestador não cadastrado.');

    const defaults = (cfg.defaults ?? {}) as { nextNumber?: number; serie?: string; cTribNac?: string; opSimpNac?: string };
    const n = defaults.nextNumber ?? 1;
    const serie = (defaults.serie ?? '1').padStart(5, '0');
    const now = new Date();
    const dCompet = input.competence ? `${input.competence}-01` : now.toISOString().slice(0, 10);
    const id = `DPS${client.ibgeCity}${client.document.length === 14 ? '2' : '1'}${client.document.padStart(14, '0')}${serie}${String(n).padStart(15, '0')}`;
    const tomaDoc = taker.document.length === 14 ? `<CNPJ>${taker.document}</CNPJ>` : `<CPF>${taker.document}</CPF>`;
    const prestDoc = client.document.length === 14 ? `<CNPJ>${client.document}</CNPJ>` : `<CPF>${client.document}</CPF>`;
    const opSimpNac = defaults.opSimpNac ?? (client.regime === 'MEI' ? '2' : client.regime === 'SIMPLES_NACIONAL' ? '3' : '1');
    const dps =
      `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infDPS Id="${id}">` +
      `<tpAmb>${process.env.NFSE_TPAMB ?? '1'}</tpAmb><dhEmi>${toBrasiliaIso(now)}</dhEmi><verAplic>ProdutivaGestao1.0</verAplic>` +
      `<serie>${serie}</serie><nDPS>${n}</nDPS><dCompet>${dCompet}</dCompet><tpEmit>1</tpEmit><cLocEmi>${client.ibgeCity}</cLocEmi>` +
      `<prest>${prestDoc}<regTrib><opSimpNac>${opSimpNac}</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>` +
      `<toma>${tomaDoc}<xNome>${escapeXml(taker.name)}</xNome>${taker.email ? `<email>${escapeXml(taker.email)}</email>` : ''}</toma>` +
      `<serv><locPrest><cLocPrestacao>${client.ibgeCity}</cLocPrestacao></locPrest><cServ><cTribNac>${defaults.cTribNac ?? cfg.serviceCode}</cTribNac><xDescServ>${escapeXml(input.description)}</xDescServ></cServ></serv>` +
      `<valores><vServPrest><vServ>${input.amount.toFixed(2)}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores>` +
      `</infDPS></DPS>`;

    let cert = await this.certs.client(clientId);
    if (!cert) throw new BadRequestException('Empresa sem certificado A1 válido para assinar a nota.');
    if (!cert.pfx.length && isSandbox()) cert = { pfx: selfSignedPfx(client.legalName, 'teste'), passphrase: 'teste' };
    const signed = signXml(dps, { pfx: cert.pfx, passphrase: cert.passphrase, referenceTag: 'infDPS', parentTag: 'DPS', algorithm: 'sha256' });
    const res = await this.nfse.issue(cert, signed);

    await this.prisma.nfseIssuerConfig.update({ where: { clientId }, data: { defaults: { ...defaults, nextNumber: n + 1 } } });
    // Grava a nota emitida (no sandbox, monta o XML de NFS-e a partir da DPS para alimentar os painéis)
    const nfseXml = isSandbox()
      ? `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infNFSe Id="NFS${res.accessKey}"><nNFSe>${n}</nNFSe><dhProc>${toBrasiliaIso(now)}</dhProc><emit>${prestDoc}<xNome>${escapeXml(client.legalName)}</xNome></emit>${signed.replace(/^<\?xml[^>]*>/, '')}</infNFSe></NFSe>`
      : res.xml;
    const doc = await this.xml.saveNfseXml(client.tenantId, clientId, client.document, nfseXml, res.accessKey);
    return { accessKey: res.accessKey, number: n, documentId: doc?.id };
  }
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
