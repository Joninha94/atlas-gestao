import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
  compareSimplesRegimes, financialSummary, revenueConcentration, supplierCreditSplit, systemFolderPath, topCounterparties, topProducts,
  OUTBOUND_BACKFILL_DAYS, type DocLite, type ReformPremises,
} from '@produtiva/core';
import { PrismaService } from '../../common/prisma.service';
import { CertificatesService } from '../../integrations/certificates.service';
import { DistDfeClient } from '../../integrations/sefaz/distdfe.client';
import { ManifestClient } from '../../integrations/sefaz/manifest.client';
import { NfseNacionalClient } from '../../integrations/nfse/nfse-nacional.client';
import { StorageService } from '../../integrations/storage/storage.service';
import { NotificationsService } from '../../integrations/notifications.service';
import { isSandbox } from '../../integrations/sandbox';
import { sampleNfe } from '../../integrations/sefaz/sample-xml';
import { DriveService } from '../drive/drive.service';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false });
const num = (v: unknown) => (v === undefined || v === null || v === '' ? 0 : Number(v));
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

@Injectable()
export class XmlService {
  private readonly log = new Logger(XmlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly certs: CertificatesService,
    private readonly dist: DistDfeClient,
    private readonly manifestClient: ManifestClient,
    private readonly nfse: NfseNacionalClient,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly drive: DriveService,
  ) {}

  // ---------------------------------------------------------------------------
  // NF-e/CT-e de entrada via DistDFe (job horário por cliente)
  // ---------------------------------------------------------------------------
  async captureNfe(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId } });
    const cert = await this.certs.client(clientId);
    if (!cert || client.document.length !== 14) return { skipped: 'Cliente sem certificado A1 válido' };

    const cursor = await this.prisma.dfeCursor.upsert({ where: { clientId_kind: { clientId, kind: 'NFE' } }, create: { clientId, kind: 'NFE' }, update: {} });
    if (cursor.nextAllowedAt && cursor.nextAllowedAt > new Date()) return { skipped: 'Aguardando janela da SEFAZ' };

    let ult = cursor.lastNsu;
    let saved = 0;
    for (let i = 0; i < 20; i++) {
      const r = await this.dist.fetch({ cnpj: client.document, ufAutor: client.uf ?? 'AL', ultNSU: ult, cert, clientName: client.legalName });
      if (r.cStat === '656') {
        await this.prisma.dfeCursor.update({ where: { id: cursor.id }, data: { nextAllowedAt: new Date(Date.now() + 3_600_000) } });
        break;
      }
      for (const d of r.docs) {
        if (d.schema.startsWith('procNFe')) saved += (await this.saveNfeXml(tenantId, clientId, client.document, d.xml)) ? 1 : 0;
        else if (d.schema.startsWith('procCTe')) saved += (await this.saveCteXml(tenantId, clientId, client.document, d.xml)) ? 1 : 0;
        else if (d.schema.startsWith('resNFe')) await this.autoCiencia(clientId, client.document, d.xml, cert);
      }
      ult = r.ultNSU || ult;
      const done = r.cStat === '137' || ult === r.maxNSU;
      await this.prisma.dfeCursor.update({ where: { id: cursor.id }, data: { lastNsu: ult, ...(done ? { nextAllowedAt: new Date(Date.now() + 3_600_000) } : {}) } });
      if (done) break;
    }
    return { saved, lastNsu: ult };
  }

  /** Resumo (resNFe) → manifesta Ciência para a SEFAZ liberar o XML completo na próxima consulta. */
  private async autoCiencia(clientId: string, cnpj: string, xml: string, cert: { pfx: Buffer; passphrase: string }) {
    const key = parser.parse(xml)?.resNFe?.chNFe;
    if (!key) return;
    await this.manifestClient.send({ cnpj, accessKey: String(key), type: 'CIENCIA', cert }).catch((e) => this.log.warn(`Ciência automática ${key}: ${e.message}`));
  }

  /** Normaliza um procNFe (modelo 55 ou 65) e grava documento + itens + arquivo. */
  async saveNfeXml(tenantId: string, clientId: string, clientDoc: string, xml: string) {
    const j = parser.parse(xml);
    const nfe = j.nfeProc?.NFe?.infNFe ?? j.NFe?.infNFe;
    if (!nfe) return null;
    const accessKey = String(nfe['@Id']).replace(/^NFe/, '');
    const { ide, emit } = nfe;
    const dest = nfe.dest ?? {};
    const tot = nfe.total?.ICMSTot ?? {};
    const issuedAt = new Date(ide.dhEmi);
    const direction = String(emit.CNPJ) === clientDoc ? 'SAIDA' : 'ENTRADA';
    const kind = String(ide.mod) === '65' ? 'NFCE' : 'NFE';
    const cStat = String(j.nfeProc?.protNFe?.infProt?.cStat ?? '100');
    // Crédito de PIS/COFINS/IBS/CBS para o destinatário: fornecedor no regime normal (CRT 3) gera crédito integral.
    const creditFromSupplier = direction === 'ENTRADA' ? String(emit.CRT ?? '') === '3' : null;
    const items = arr<any>(nfe.det).map((d) => ({
      code: String(d.prod.cProd ?? ''), description: String(d.prod.xProd), ncm: String(d.prod.NCM ?? ''), cfop: String(d.prod.CFOP ?? ''),
      quantity: num(d.prod.qCom), unitValue: num(d.prod.vUnCom), total: num(d.prod.vProd), generatesCredit: creditFromSupplier,
    }));
    return this.persist(tenantId, clientId, xml, {
      kind, direction, accessKey, number: String(ide.nNF), series: String(ide.serie), issuedAt,
      issuerDoc: String(emit.CNPJ ?? emit.CPF), issuerName: String(emit.xNome),
      receiverDoc: dest.CNPJ ?? dest.CPF ?? null, receiverName: dest.xNome ?? null,
      totalAmount: num(tot.vNF), icms: num(tot.vICMS), pis: num(tot.vPIS), cofins: num(tot.vCOFINS), freight: num(tot.vFrete),
      status: cStat === '100' ? 'AUTORIZADA' : cStat === '101' ? 'CANCELADA' : 'DENEGADA', items,
    });
  }

  async saveCteXml(tenantId: string, clientId: string, clientDoc: string, xml: string) {
    const j = parser.parse(xml);
    const cte = j.cteProc?.CTe?.infCte;
    if (!cte) return null;
    const accessKey = String(cte['@Id']).replace(/^CTe/, '');
    const tomaIsClient = JSON.stringify(cte.ide ?? {}).includes(clientDoc) || String(cte.dest?.CNPJ) === clientDoc || String(cte.rem?.CNPJ) === clientDoc;
    return this.persist(tenantId, clientId, xml, {
      kind: 'CTE', direction: String(cte.emit?.CNPJ) === clientDoc ? 'SAIDA' : 'ENTRADA', accessKey, number: String(cte.ide?.nCT), series: String(cte.ide?.serie ?? ''),
      issuedAt: new Date(cte.ide?.dhEmi), issuerDoc: String(cte.emit?.CNPJ), issuerName: String(cte.emit?.xNome),
      receiverDoc: tomaIsClient ? clientDoc : null, receiverName: null, totalAmount: num(cte.vPrest?.vTPrest), freight: num(cte.vPrest?.vTPrest),
      status: 'AUTORIZADA', items: [],
    });
  }

  /** NFS-e padrão nacional: prestadas e tomadas. */
  async saveNfseXml(tenantId: string, clientId: string, clientDoc: string, xml: string, accessKey: string) {
    const j = parser.parse(xml);
    const inf = j.NFSe?.infNFSe;
    if (!inf) return null;
    const dps = inf.DPS?.infDPS ?? {};
    const prestDoc = String(dps.prest?.CNPJ ?? inf.emit?.CNPJ ?? '');
    const v = dps.valores ?? {};
    const value = num(v.vServPrest?.vServ);
    return this.persist(tenantId, clientId, xml, {
      kind: 'NFSE', direction: prestDoc === clientDoc ? 'PRESTADO' : 'TOMADO', accessKey, number: String(inf.nNFSe ?? ''), series: null,
      issuedAt: new Date(inf.dhProc ?? dps.dCompet), issuerDoc: prestDoc, issuerName: String(inf.emit?.xNome ?? ''),
      receiverDoc: dps.toma?.CNPJ ?? dps.toma?.CPF ?? null, receiverName: dps.toma?.xNome ?? null,
      totalAmount: value, iss: num(v.trib?.tribMun?.vISSQN), status: 'AUTORIZADA',
      items: [{ code: '', description: String(dps.serv?.cServ?.xDescServ ?? 'Serviço'), ncm: '', cfop: '', quantity: 1, unitValue: value, total: value, generatesCredit: null }],
    });
  }

  private async persist(tenantId: string, clientId: string, xml: string, d: any) {
    const key = this.storage.key(tenantId, 'xml', clientId, `${d.accessKey}.xml`);
    await this.storage.put(key, xml, 'application/xml');
    const competence = d.issuedAt.toISOString().slice(0, 7);
    const { items, ...doc } = d;
    try {
      const row = await this.prisma.fiscalDocument.create({ data: { tenantId, clientId, ...doc, competence, xmlKey: key, items: { create: items } } });
      await this.drive.saveSystemFile(tenantId, clientId, systemFolderPath(d.kind, competence), `${d.accessKey}.xml`, key, xml.length, 'application/xml');
      return row;
    } catch (e: any) {
      if (e?.code === 'P2002') return null; // já capturada
      throw e;
    }
  }

  async captureNfse(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId } });
    const cert = await this.certs.client(clientId);
    if (!cert) return { skipped: 'Cliente sem certificado A1' };
    const cursor = await this.prisma.dfeCursor.upsert({ where: { clientId_kind: { clientId, kind: 'NFSE' } }, create: { clientId, kind: 'NFSE' }, update: {} });
    const items = await this.nfse.distribute(cert, client.document, Number(cursor.lastNsu), client.legalName);
    let saved = 0;
    for (const it of items) saved += (await this.saveNfseXml(tenantId, clientId, client.document, it.xml, it.chaveAcesso)) ? 1 : 0;
    if (items.length) await this.prisma.dfeCursor.update({ where: { id: cursor.id }, data: { lastNsu: String(Math.max(...items.map((i) => i.nsu))) } });
    return { saved };
  }

  /**
   * Notas de SAÍDA (NF-e/NFC-e): exige uma nota de referência do cliente; a captura volta 60 dias
   * e segue diariamente. A busca por chave é feita por UF (adaptador por estado, ver docs).
   */
  async captureOutbound(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId, tenantId } });
    const cursor = await this.prisma.dfeCursor.findUnique({ where: { clientId_kind: { clientId, kind: 'NFCE' } } })
      ?? await this.prisma.dfeCursor.findUnique({ where: { clientId_kind: { clientId, kind: 'NFE' } } });
    if (!cursor?.referenceKey) return { skipped: 'Sem nota de referência' };
    if (!isSandbox()) return { skipped: `Adaptador de saídas para ${client.uf} ainda não habilitado` };
    let saved = 0;
    for (let i = 0; i < 10; i++) {
      const issuedAt = new Date(Date.now() - Math.floor((i * OUTBOUND_BACKFILL_DAYS) / 10) * 86_400_000);
      const { xml } = sampleNfe({ clientCnpj: client.document, clientName: client.legalName, direction: 'SAIDA', n: 5000 + i, issuedAt });
      saved += (await this.saveNfeXml(tenantId, clientId, client.document, xml)) ? 1 : 0;
    }
    return { saved };
  }

  /** Receita por competência a partir das notas (fonte XML) para clientes fora do Simples. */
  async rebuildRevenue(clientId: string) {
    const rows = await this.prisma.fiscalDocument.groupBy({
      by: ['competence'],
      where: { clientId, status: 'AUTORIZADA', direction: { in: ['SAIDA', 'PRESTADO'] } },
      _sum: { totalAmount: true },
    });
    for (const r of rows) {
      await this.prisma.revenueSnapshot.upsert({
        where: { clientId_competence_source: { clientId, competence: r.competence, source: 'XML' } },
        create: { clientId, competence: r.competence, revenue: r._sum.totalAmount ?? 0, source: 'XML' },
        update: { revenue: r._sum.totalAmount ?? 0 },
      });
    }
    return rows.length;
  }

  // ---------------------------------------------------------------------------
  // Manifestação do destinatário
  // ---------------------------------------------------------------------------
  async manifest(documentId: string, type: 'CIENCIA' | 'CONFIRMACAO' | 'DESCONHECIMENTO' | 'NAO_REALIZADA', by: { userId?: string; byClient?: boolean }, justification?: string) {
    const doc = await this.prisma.fiscalDocument.findFirstOrThrow({ where: { id: documentId }, include: { client: true } });
    if (doc.kind !== 'NFE' || doc.direction !== 'ENTRADA') throw new BadRequestException('Manifestação só se aplica a NF-e de entrada.');
    if (type === 'NAO_REALIZADA' && (!justification || justification.length < 15)) throw new BadRequestException('Justificativa de pelo menos 15 caracteres.');
    const cert = await this.certs.client(doc.clientId);
    if (!cert) throw new BadRequestException('Cliente sem certificado A1 para assinar a manifestação.');
    const r = await this.manifestClient.send({ cnpj: doc.client.document, accessKey: doc.accessKey, type, cert, justification });
    if (!['135', '136', '573'].includes(r.cStat)) throw new BadRequestException(`SEFAZ: ${r.cStat} - ${r.xMotivo}`);
    return this.prisma.manifestation.create({ data: { documentId, type, byUserId: by.userId, byClient: !!by.byClient, protocol: r.protocol } });
  }

  // ---------------------------------------------------------------------------
  // Exportação diária às 11h (Domínio / Alterdata / ZIP por cliente e tipo)
  // ---------------------------------------------------------------------------
  async exportPending(tenantId: string, target: 'DOMINIO' | 'ALTERDATA' | 'ZIP') {
    const docs = await this.prisma.fiscalDocument.findMany({ where: { tenantId, exportedAt: null }, include: { client: { select: { document: true } } }, take: 5000 });
    if (!docs.length) return { exported: 0 };
    const zip = await this.zipDocs(docs);
    const key = this.storage.key(tenantId, 'exports', `${target}_${new Date().toISOString().slice(0, 10)}_${Date.now()}.zip`);
    await this.storage.put(key, zip, 'application/zip');
    await this.prisma.fiscalDocument.updateMany({ where: { id: { in: docs.map((d) => d.id) } }, data: { exportedAt: new Date() } });
    await this.prisma.exportJob.create({ data: { tenantId, target, runAt: new Date(), docsCount: docs.length, fileKey: key } });
    // DOMINIO / ALTERDATA: o agente local (apps/agent) baixa este ZIP e o coloca na pasta de importação do sistema contábil.
    return { exported: docs.length, fileKey: key };
  }

  /** Download em lote: pastas zipadas por cliente e por tipo de nota. */
  async zipForDownload(tenantId: string, filter: { clientId?: string; competence?: string; kind?: string }) {
    const docs = await this.prisma.fiscalDocument.findMany({
      where: { tenantId, clientId: filter.clientId, competence: filter.competence, kind: filter.kind as any },
      include: { client: { select: { document: true } } },
      take: 10000,
    });
    const key = this.storage.key(tenantId, 'exports', `xml_${Date.now()}.zip`);
    await this.storage.put(key, await this.zipDocs(docs), 'application/zip');
    return { count: docs.length, url: await this.storage.signedUrl(key, 3600, 'notas.zip') };
  }

  private async zipDocs(docs: { client: { document: string }; kind: string; direction: string; accessKey: string; xmlKey: string }[]) {
    const zip = new JSZip();
    for (const d of docs) zip.file(`${d.client.document}/${d.kind}/${d.direction.toLowerCase()}/${d.accessKey}.xml`, await this.storage.get(d.xmlKey));
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  // ---------------------------------------------------------------------------
  // Painéis
  // ---------------------------------------------------------------------------
  private async lite(clientId: string, from: string, to: string): Promise<DocLite[]> {
    const docs = await this.prisma.fiscalDocument.findMany({ where: { clientId, competence: { gte: from, lte: to } }, include: { items: true } });
    return docs.map((d) => ({
      kind: d.kind, direction: d.direction, issuerDoc: d.issuerDoc, issuerName: d.issuerName,
      receiverDoc: d.receiverDoc, receiverName: d.receiverName, totalAmount: Number(d.totalAmount),
      freight: d.freight ? Number(d.freight) : null, status: d.status,
      items: d.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), total: Number(i.total), generatesCredit: i.generatesCredit })),
    }));
  }

  async clientPanel(clientId: string, from: string, to: string) {
    const docs = await this.lite(clientId, from, to);
    const byMonth = await this.prisma.fiscalDocument.groupBy({
      by: ['competence', 'direction'],
      where: { clientId, competence: { gte: from, lte: to }, status: 'AUTORIZADA' },
      _sum: { totalAmount: true, icms: true, iss: true, pis: true, cofins: true },
      _count: true,
      orderBy: { competence: 'asc' },
    });
    const servicos = docs.filter((d) => d.kind === 'NFSE');
    const prestados = servicos.filter((d) => d.direction === 'PRESTADO').reduce((s, d) => s + d.totalAmount, 0);
    const tomados = servicos.filter((d) => d.direction === 'TOMADO').reduce((s, d) => s + d.totalAmount, 0);
    return {
      resumo: financialSummary(docs),
      porMes: byMonth.map((m) => ({ competence: m.competence, direction: m.direction, count: m._count, total: Number(m._sum.totalAmount ?? 0), icms: Number(m._sum.icms ?? 0), iss: Number(m._sum.iss ?? 0), pis: Number(m._sum.pis ?? 0), cofins: Number(m._sum.cofins ?? 0) })),
      servicos: { prestados: round(prestados), tomados: round(tomados), saldo: round(prestados - tomados) },
      melhoresClientes: topCounterparties(docs, 'clientes'),
      maioresFornecedores: topCounterparties(docs, 'fornecedores'),
      concentracaoReceitaPct: revenueConcentration(docs),
      produtosMaisVendidos: topProducts(docs, 'SAIDA'),
      produtosMaisComprados: topProducts(docs, 'ENTRADA'),
      volume: docs.length,
    };
  }

  /** Enterprise: Simples normal × híbrido, calculadora da reforma e oportunidades de crédito. */
  async opportunities(clientId: string, from: string, to: string, premises: ReformPremises[], b2bRevenueShare: number) {
    const docs = await this.lite(clientId, from, to);
    const s = financialSummary(docs);
    const months = Math.max(1, monthsBetween(from, to));
    const factor = 12 / months; // anualiza o período analisado
    return {
      baseAnual: { receita: round(s.revenue * factor), compras: round(s.cost * factor), mesesAnalisados: months },
      projecoes: premises.map((p) => compareSimplesRegimes({ annualRevenue: s.revenue * factor, annualPurchases: s.cost * factor, b2bRevenueShare }, p)),
      ...supplierCreditSplit(docs),
    };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
function monthsBetween(from: string, to: string) {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}
