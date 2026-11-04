import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, Param, Post, Put, Query, Res } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Response } from 'express';
import { z } from 'zod';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { formatDocument, isValidCnpj, isValidCpf, onlyDigits, sublimitRuler } from '@produtiva/core';
import { AuthUser, CurrentUser, PERMISSIONS, RequirePermission } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { VaultService } from '../../common/vault.service';
import { ClientCreatedEvent, Events } from '../../common/events';
import { CnpjService } from '../../integrations/cnpj/cnpj.service';
import { CertificatesService } from '../../integrations/certificates.service';
import { IntegraContadorClient, SERPRO_SERVICES } from '../../integrations/serpro/integra-contador.client';
import { simplePdf } from '../../integrations/pdf.util';
import { isSandbox } from '../../integrations/sandbox';
import { selfSignedPfx } from '../../integrations/xmldsig';

const Channels = z.array(z.enum(['EMAIL', 'WHATSAPP', 'APP']));
const ContactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().optional(),
  role: z.string().optional(),
  receives: Channels.default(['EMAIL', 'WHATSAPP']),
  appLogin: z.boolean().default(false),
});
const RegimeEnum = z.enum(['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PESSOA_FISICA']);
const CreateClientSchema = z.object({
  document: z.string(),
  regime: RegimeEnum,
  legalName: z.string().optional(),
  contacts: z.array(ContactSchema).default([]),
  responsibles: z.array(z.object({ userId: z.string().uuid(), departmentId: z.string().uuid() })).default([]),
  notes: z.string().optional(),
});
const UpdateClientSchema = z.object({
  regime: RegimeEnum.optional(),
  legalName: z.string().optional(),
  tradeName: z.string().optional(),
  notes: z.string().optional(),
  extraData: z.record(z.string(), z.unknown()).optional(),
  stateRegistration: z.string().optional(),
  municipalRegistration: z.string().optional(),
  appAccess: z.boolean().optional(),
  appPlus: z.boolean().optional(),
  active: z.boolean().optional(),
});

const normalizePhone = (p?: string) => {
  if (!p) return undefined;
  const d = p.replace(/\D/g, '');
  return d.length >= 10 && !d.startsWith('55') ? `55${d}` : d;
};

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cnpj: CnpjService,
    private readonly vault: VaultService,
    private readonly certs: CertificatesService,
    private readonly serpro: IntegraContadorClient,
    private readonly events: EventEmitter2,
  ) {}

  /** Cadastro: com CNPJ, busca dados cadastrais, cartão CNPJ e QSA automaticamente. */
  async create(tenantId: string, body: unknown) {
    const input = CreateClientSchema.parse(body);
    const document = onlyDigits(input.document);
    if (!(document.length === 14 ? isValidCnpj(document) : isValidCpf(document))) throw new BadRequestException('CPF/CNPJ inválido.');
    if (await this.prisma.clientCompany.findFirst({ where: { document } })) throw new ConflictException('Cliente já cadastrado.');

    const data = document.length === 14 ? await this.cnpj.lookup(document).catch(() => null) : null;
    const client = await this.prisma.clientCompany.create({
      data: {
        tenantId,
        document,
        regime: input.regime,
        legalName: input.legalName ?? data?.legalName ?? 'A preencher',
        tradeName: data?.tradeName,
        legalNature: data?.legalNature,
        cnae: data?.cnae,
        uf: data?.uf,
        city: data?.city,
        ibgeCity: data?.ibgeCity,
        openedAt: data?.openedAt ? new Date(data.openedAt) : undefined,
        partners: (data?.partners ?? []) as any,
        rawCnpjData: (data?.raw ?? undefined) as any,
        notes: input.notes,
        contacts: { create: input.contacts.map((c) => ({ ...c, phone: normalizePhone(c.phone), email: c.email?.toLowerCase() })) },
        responsibles: { create: input.responsibles },
      },
    });
    const evt: ClientCreatedEvent = { tenantId, clientId: client.id, regime: client.regime };
    // Drive cria as pastas e Tarefas aplica os modelos do regime.
    // Os ouvintes rodam no mesmo contexto do escritório; aguardamos para devolver o cliente já completo.
    await this.events.emitAsync(Events.CLIENT_CREATED, evt);
    return client;
  }

  /** Importação em lote (planilha: documento;regime;nome do contato;e-mail;telefone). */
  async importCsv(tenantId: string, csv: string) {
    const report: { line: number; document: string; status: string }[] = [];
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const [i, line] of lines.entries()) {
      const [document, regime, name, email, phone] = line.split(/[;,\t]/).map((x) => x?.trim());
      if (i === 0 && !/\d/.test(document)) continue; // cabeçalho
      try {
        await this.create(tenantId, { document, regime, contacts: name ? [{ name, email, phone, receives: ['EMAIL', 'WHATSAPP'] }] : [] });
        report.push({ line: i + 1, document, status: 'CRIADO' });
      } catch (e) {
        report.push({ line: i + 1, document, status: (e as Error).message });
      }
    }
    return report;
  }

  /** Upload do certificado A1 (PFX) do cliente ou do escritório. Lê validade e cifra antes de gravar. */
  async uploadCertificate(tenantId: string, owner: 'ESCRITORIO' | 'CLIENTE', pfx: Buffer, password: string, clientId?: string) {
    let bag: forge.pkcs12.Bag | undefined;
    try {
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), password);
      bag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    } catch {
      throw new BadRequestException('Certificado inválido ou senha incorreta.');
    }
    if (!bag?.cert) throw new BadRequestException('Certificado inválido ou senha incorreta.');
    const cn = String(bag.cert.subject.getField('CN')?.value ?? '');
    const sealed = this.vault.seal(pfx);
    const row = await this.prisma.certificate.create({
      data: {
        tenantId, owner, clientId, subjectName: cn, document: onlyDigits(cn.split(':').pop() ?? ''),
        validFrom: bag.cert.validity.notBefore, validTo: bag.cert.validity.notAfter,
        pfxEnc: new Uint8Array(sealed.ciphertext), dekEnc: sealed.dekEnc, passwordEnc: this.vault.sealString(password),
      },
      select: { id: true, subjectName: true, validFrom: true, validTo: true, owner: true },
    });
    await this.prisma.auditLog.create({ data: { tenantId, clientId, action: 'certificate.upload', entity: 'Certificate', entityId: row.id } });
    return row;
  }

  /** Confere a procuração eletrônica do escritório para o cliente (serviços outorgados e validade). */
  async checkPowerOfAttorney(tenantId: string, clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({ where: { id: clientId } });
    const office = await this.certs.office(tenantId);
    const res = await this.serpro.call<{ dtexpiracao?: string; sistemas?: string[] }[]>(
      { pfx: office.pfx, passphrase: office.passphrase },
      SERPRO_SERVICES.PROCURACOES_OBTER,
      { numero: office.cnpj, tipo: 2 },
      { numero: client.document, tipo: client.document.length === 14 ? 2 : 1 },
      { outorgante: client.document, tipoOutorgante: client.document.length === 14 ? '2' : '1', outorgado: office.cnpj, tipoOutorgado: '2' },
    );
    const p = Array.isArray(res.dados) ? res.dados[0] : undefined;
    const validTo = p?.dtexpiracao ? new Date(`${p.dtexpiracao.slice(0, 4)}-${p.dtexpiracao.slice(4, 6)}-${p.dtexpiracao.slice(6, 8)}`) : null;
    return this.prisma.powerOfAttorney.upsert({
      where: { clientId },
      create: { clientId, validTo, services: p?.sistemas ?? [], checkedAt: new Date(), ok: !!p && (!validTo || validTo > new Date()) },
      update: { validTo, services: p?.sistemas ?? [], checkedAt: new Date(), ok: !!p && (!validTo || validTo > new Date()) },
    });
  }

  /** Painel da carteira: certificados e procurações, mapa por UF/região, regime e natureza. */
  async portfolio() {
    const clients = await this.prisma.clientCompany.findMany({
      where: { active: true },
      select: { id: true, uf: true, regime: true, legalNature: true, certificates: { select: { validTo: true } }, powerOfAttorney: { select: { ok: true, validTo: true } } },
    });
    const count = (key: (c: (typeof clients)[number]) => string | null | undefined) =>
      clients.reduce<Record<string, number>>((acc, c) => {
        const k = key(c) ?? 'N/D';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    const now = Date.now();
    const in30 = now + 30 * 86_400_000;
    return {
      total: clients.length,
      porUF: count((c) => c.uf),
      porRegiao: count((c) => REGIAO[c.uf ?? ''] ?? 'N/D'),
      porRegime: count((c) => c.regime),
      porNatureza: count((c) => c.legalNature?.split(' - ')[1] ?? c.legalNature),
      certificados: {
        vencidos: clients.filter((c) => c.certificates.length && c.certificates.every((x) => x.validTo.getTime() < now)).length,
        vencendo30d: clients.filter((c) => c.certificates.some((x) => x.validTo.getTime() >= now && x.validTo.getTime() < in30)).length,
        semCertificado: clients.filter((c) => c.certificates.length === 0).length,
      },
      procuracao: {
        valida: clients.filter((c) => c.powerOfAttorney?.ok).length,
        invalidaOuNaoVerificada: clients.filter((c) => !c.powerOfAttorney?.ok).length,
      },
    };
  }

  /** Checkup 360: tudo do Monitor do cliente numa tela. */
  async checkup360(clientId: string) {
    const client = await this.prisma.clientCompany.findFirstOrThrow({
      where: { id: clientId },
      include: { contacts: true, responsibles: { include: { user: { select: { name: true } } } }, powerOfAttorney: true, certificates: { select: { id: true, validTo: true, owner: true, subjectName: true } } },
    });
    const [guides, declarations, installments, certidoes, mailbox, revenue, situation, employees, processes] = await Promise.all([
      this.prisma.fiscalGuide.findMany({ where: { clientId, status: { not: 'CANCELADA' } }, orderBy: { dueDate: 'desc' }, take: 24 }),
      this.prisma.declaration.findMany({ where: { clientId }, orderBy: { period: 'desc' }, take: 60 }),
      this.prisma.installment.findMany({ where: { clientId } }),
      this.prisma.certidao.findMany({ where: { clientId }, orderBy: { fetchedAt: 'desc' }, distinct: ['kind', 'uf'] }),
      this.prisma.mailboxMessage.count({ where: { clientId, isRead: false } }),
      this.prisma.revenueSnapshot.findMany({ where: { clientId }, orderBy: { competence: 'asc' } }),
      this.prisma.fiscalSituation.findFirst({ where: { clientId }, orderBy: { fetchedAt: 'desc' } }),
      this.prisma.fgtsEmployee.groupBy({ by: ['situation'], where: { clientId }, _count: true }),
      this.prisma.process.findMany({ where: { clientId, status: { in: ['A_FAZER', 'EM_PROGRESSO', 'EM_MULTA'] } }, orderBy: { dueDate: 'asc' }, take: 20 }),
    ]);
    const source = revenue.some((r) => r.source === 'PGDASD') ? 'PGDASD' : 'XML';
    const hist = revenue.filter((r) => r.source === source).map((r) => ({ competence: r.competence, revenue: Number(r.revenue) }));
    const last = hist.at(-1)?.competence ?? new Date().toISOString().slice(0, 7);
    return {
      client,
      faturamento12m: hist.slice(-12),
      fonteFaturamento: source,
      sublimite: client.regime === 'SIMPLES_NACIONAL' ? sublimitRuler(hist, last) : null,
      guias: guides,
      declaracoes: declarations,
      parcelamentos: installments,
      certidoes,
      mensagensNaoLidas: mailbox,
      situacaoFiscal: situation,
      empregados: employees.map((e) => ({ situation: e.situation, count: e._count })),
      obrigacoesAbertas: processes,
    };
  }

  /** PDF assinado digitalmente pelo escritório (A1): Checkup 360 ou relação de faturamento 12 meses. */
  async signedPdf(tenantId: string, clientId: string, kind: 'checkup' | 'faturamento') {
    const data = await this.checkup360(clientId);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const c = data.client;
    const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const header: [string, string][] = [['Empresa', c.legalName], ['CNPJ/CPF', formatDocument(c.document)], ['Regime', c.regime]];
    let lines: (string | [string, string])[];
    if (kind === 'faturamento') {
      const total = data.faturamento12m.reduce((s, r) => s + r.revenue, 0);
      lines = [...header, '', 'Relação de faturamento — últimos 12 meses', '', ...data.faturamento12m.map((r) => [r.competence.split('-').reverse().join('/'), brl(r.revenue)] as [string, string]), '', ['Total', brl(total)]];
    } else {
      lines = [
        ...header, '',
        ['Guias em aberto', String(data.guias.filter((g) => g.status !== 'PAGA').length)],
        ['Declarações ausentes', String(data.declaracoes.filter((d) => d.status === 'AUSENTE').length)],
        ['Parcelamentos ativos', String(data.parcelamentos.length)],
        ['Mensagens não lidas (e-CAC)', String(data.mensagensNaoLidas)],
        ['Situação fiscal', data.situacaoFiscal ? (data.situacaoFiscal.hasPending ? 'Com pendências' : 'Regular') : 'Não consultada'],
        ...(data.sublimite ? [['Sublimite do Simples', `${data.sublimite.percentOfSublimit}% (${brl(data.sublimite.accumulated)})`] as [string, string]] : []),
        '', 'Certidões',
        ...data.certidoes.map((x) => [`${x.kind}${x.uf ? ` ${x.uf}` : ''}`, x.status] as [string, string]),
        '', 'Últimas guias',
        ...data.guias.slice(0, 12).map((g) => [`${g.type} ${g.competence}`, `${brl(Number(g.total))} · ${g.status}`] as [string, string]),
      ];
    }
    const title = kind === 'faturamento' ? 'Relação de Faturamento' : 'Checkup 360';
    const raw = await simplePdf(`${title} — ${tenant.name}`, lines, `Emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Maceio' })} · assinado digitalmente por ${tenant.name}`);

    // Assinatura PAdES com o certificado A1 do escritório
    let cert: { pfx: Buffer; passphrase: string };
    try {
      const o = await this.certs.office(tenantId);
      cert = o.pfx.length ? { pfx: o.pfx, passphrase: o.passphrase } : { pfx: selfSignedPfx(`${tenant.name} (TESTE)`, 'teste'), passphrase: 'teste' };
    } catch {
      if (!isSandbox()) throw new BadRequestException('Cadastre o certificado digital do escritório para assinar o PDF.');
      cert = { pfx: selfSignedPfx(`${tenant.name} (TESTE)`, 'teste'), passphrase: 'teste' };
    }
    const doc = await PDFDocument.load(raw);
    pdflibAddPlaceholder({ pdfDoc: doc, reason: title, contactInfo: tenant.emailFrom ?? '', name: tenant.name, location: 'Brasil' });
    const withPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }));
    const signed = await new SignPdf().sign(withPlaceholder, new P12Signer(cert.pfx, { passphrase: cert.passphrase }));
    return { fileName: `${kind}_${c.document}.pdf`, pdf: Buffer.from(signed) };
  }
}

const REGIAO: Record<string, string> = {
  AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
};

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService, private readonly prisma: PrismaService, private readonly cnpj: CnpjService) {}

  @Get()
  list(@Query('q') q?: string, @Query('regime') regime?: string, @Query('uf') uf?: string, @Query('responsibleId') responsibleId?: string, @Query('active') active?: string) {
    const digits = q ? onlyDigits(q) : '';
    return this.prisma.clientCompany.findMany({
      where: {
        regime: regime as any,
        uf,
        active: active === 'false' ? false : true,
        ...(responsibleId ? { responsibles: { some: { userId: responsibleId } } } : {}),
        ...(q ? { OR: [{ legalName: { contains: q, mode: 'insensitive' } }, { tradeName: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ document: { contains: digits } }] : [])] } : {}),
      },
      include: {
        certificates: { select: { validTo: true }, orderBy: { validTo: 'desc' }, take: 1 },
        powerOfAttorney: { select: { ok: true, validTo: true } },
        contacts: { select: { id: true, name: true, phone: true, email: true } },
        responsibles: { select: { userId: true, departmentId: true } },
      },
      orderBy: { legalName: 'asc' },
      take: 1000,
    });
  }

  @Get('portfolio')
  portfolio() {
    return this.clients.portfolio();
  }

  @Post()
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.clients.create(u.tenantId, body);
  }

  @Post('import')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  import(@CurrentUser() u: AuthUser, @Body() b: { csv: string }) {
    return this.clients.importCsv(u.tenantId, b.csv);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.clientCompany.findFirstOrThrow({
      where: { id },
      include: { contacts: true, responsibles: { include: { user: { select: { id: true, name: true } } } }, certificates: { select: { id: true, owner: true, subjectName: true, validFrom: true, validTo: true } }, powerOfAttorney: true },
    });
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  update(@Param('id') id: string, @Body() body: unknown) {
    const d = UpdateClientSchema.parse(body);
    return this.prisma.clientCompany.update({ where: { id }, data: { ...d, extraData: d.extraData as any } });
  }

  @Post(':id/refresh-cnpj')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  async refreshCnpj(@Param('id') id: string) {
    const c = await this.prisma.clientCompany.findFirstOrThrow({ where: { id } });
    const d = await this.cnpj.lookup(c.document);
    return this.prisma.clientCompany.update({ where: { id }, data: { legalName: d.legalName, tradeName: d.tradeName, legalNature: d.legalNature, cnae: d.cnae, uf: d.uf, city: d.city, ibgeCity: d.ibgeCity, partners: d.partners as any, rawCnpjData: d.raw as any } });
  }

  // ----- Contatos e responsáveis -----
  @Post(':id/contacts')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  addContact(@Param('id') id: string, @Body() body: unknown) {
    const c = ContactSchema.parse(body);
    return this.prisma.clientContact.create({ data: { ...c, clientId: id, phone: normalizePhone(c.phone), email: c.email?.toLowerCase() } });
  }

  @Put(':id/contacts/:contactId')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  async updateContact(@Param('id') id: string, @Param('contactId') contactId: string, @Body() body: unknown) {
    await this.prisma.clientCompany.findFirstOrThrow({ where: { id } });
    const c = ContactSchema.partial().parse(body);
    return this.prisma.clientContact.update({ where: { id: contactId }, data: { ...c, phone: c.phone ? normalizePhone(c.phone) : undefined } });
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  async removeContact(@Param('id') id: string, @Param('contactId') contactId: string) {
    await this.prisma.clientCompany.findFirstOrThrow({ where: { id } });
    return this.prisma.clientContact.delete({ where: { id: contactId } });
  }

  @Put(':id/responsibles')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  async responsibles(@Param('id') id: string, @Body() b: { items: { userId: string; departmentId: string }[] }) {
    await this.prisma.clientCompany.findFirstOrThrow({ where: { id } });
    await this.prisma.clientResponsible.deleteMany({ where: { clientId: id } });
    await this.prisma.clientResponsible.createMany({ data: b.items.map((x) => ({ ...x, clientId: id })) });
    return this.prisma.clientResponsible.findMany({ where: { clientId: id } });
  }

  // ----- Certificado e procuração -----
  @Post(':id/certificate')
  @RequirePermission(PERMISSIONS.CLIENTS_MANAGE)
  cert(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { pfxBase64: string; password: string }) {
    return this.clients.uploadCertificate(u.tenantId, 'CLIENTE', Buffer.from(b.pfxBase64, 'base64'), b.password, id);
  }

  @Post(':id/power-of-attorney/check')
  poa(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.clients.checkPowerOfAttorney(u.tenantId, id);
  }

  @Get(':id/checkup')
  checkup(@Param('id') id: string) {
    return this.clients.checkup360(id);
  }

  @Get(':id/pdf/:kind')
  async pdf(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('kind') kind: 'checkup' | 'faturamento', @Res() res: Response) {
    const { fileName, pdf } = await this.clients.signedPdf(u.tenantId, id, kind === 'faturamento' ? 'faturamento' : 'checkup');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdf);
  }

  @Get(':id/timeline')
  async timeline(@Param('id') id: string) {
    const [audit, dispatches] = await Promise.all([
      this.prisma.auditLog.findMany({ where: { clientId: id }, orderBy: { at: 'desc' }, take: 100 }),
      this.prisma.guideDispatch.findMany({ where: { guide: { clientId: id } }, include: { guide: { select: { type: true, competence: true } } }, orderBy: { sentAt: 'desc' }, take: 100 }),
    ]);
    return { audit, dispatches };
  }
}

@Module({
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
