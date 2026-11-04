/**
 * Notas fiscais: agregações usadas nos painéis do módulo XML e no App do cliente.
 * Funções puras sobre documentos já normalizados (o parser fica na API).
 */

export interface DocLite {
  kind: 'NFE' | 'NFCE' | 'CTE' | 'NFSE';
  direction: 'ENTRADA' | 'SAIDA' | 'PRESTADO' | 'TOMADO';
  issuerDoc: string;
  issuerName: string;
  receiverDoc?: string | null;
  receiverName?: string | null;
  totalAmount: number;
  freight?: number | null;
  status: string;
  items?: { description: string; quantity: number; total: number; generatesCredit?: boolean | null }[];
}

const valid = (d: DocLite) => d.status === 'AUTORIZADA';
const isRevenue = (d: DocLite) => d.direction === 'SAIDA' || d.direction === 'PRESTADO';
const isCost = (d: DocLite) => d.direction === 'ENTRADA' || d.direction === 'TOMADO';

export function financialSummary(docs: DocLite[]) {
  const v = docs.filter(valid);
  const revenue = sum(v.filter(isRevenue).map((d) => d.totalAmount));
  const cost = sum(v.filter(isCost).map((d) => d.totalAmount));
  const freight = sum(v.filter(isCost).map((d) => d.freight ?? 0)) + sum(v.filter((d) => d.kind === 'CTE' && isCost(d)).map((d) => d.totalAmount));
  const thirdParty = sum(v.filter((d) => d.direction === 'TOMADO').map((d) => d.totalAmount));
  const share = (n: number) => (cost > 0 ? Math.round((n / cost) * 10_000) / 100 : 0);
  return {
    revenue,
    cost,
    margin: Math.round((revenue - cost) * 100) / 100,
    costComposition: { freightPct: share(freight), thirdPartyServicesPct: share(thirdParty) },
    avgTicketIn: avg(v.filter(isCost).map((d) => d.totalAmount)),
    avgTicketOut: avg(v.filter(isRevenue).map((d) => d.totalAmount)),
  };
}

export function topCounterparties(docs: DocLite[], side: 'clientes' | 'fornecedores', n = 10) {
  const map = new Map<string, { doc: string; name: string; total: number; count: number }>();
  for (const d of docs.filter(valid)) {
    const use = side === 'clientes' ? isRevenue(d) : isCost(d);
    if (!use) continue;
    const doc = side === 'clientes' ? d.receiverDoc ?? '' : d.issuerDoc;
    const name = side === 'clientes' ? d.receiverName ?? 'Consumidor' : d.issuerName;
    const cur = map.get(doc) ?? { doc, name, total: 0, count: 0 };
    cur.total += d.totalAmount;
    cur.count += 1;
    map.set(doc, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

/** Concentração de receita: percentual do maior tomador/cliente. */
export function revenueConcentration(docs: DocLite[]): number {
  const top = topCounterparties(docs, 'clientes', 1000);
  const total = sum(top.map((t) => t.total));
  return total > 0 ? Math.round((top[0].total / total) * 10_000) / 100 : 0;
}

export function topProducts(docs: DocLite[], direction: 'SAIDA' | 'ENTRADA', n = 10) {
  const map = new Map<string, { description: string; quantity: number; total: number }>();
  for (const d of docs.filter((x) => valid(x) && x.direction === direction)) {
    for (const it of d.items ?? []) {
      const key = it.description.trim().toUpperCase();
      const cur = map.get(key) ?? { description: it.description, quantity: 0, total: 0 };
      cur.quantity += it.quantity;
      cur.total += it.total;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

/** Fornecedores sem crédito (alerta) e com crédito (oportunidade) — base da consultoria da reforma. */
export function supplierCreditSplit(docs: DocLite[]) {
  const withCredit = new Map<string, number>();
  const withoutCredit = new Map<string, number>();
  for (const d of docs.filter((x) => valid(x) && isCost(x))) {
    const credit = (d.items ?? []).some((i) => i.generatesCredit === true);
    const target = credit ? withCredit : withoutCredit;
    target.set(d.issuerName, (target.get(d.issuerName) ?? 0) + d.totalAmount);
  }
  const toList = (m: Map<string, number>) => [...m.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  return { oportunidades: toList(withCredit), alertas: toList(withoutCredit) };
}

/** Janela inicial de captura de notas de saída a partir da nota de referência. */
export const OUTBOUND_BACKFILL_DAYS = 60;

const sum = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;
const avg = (a: number[]) => (a.length ? Math.round((sum(a) / a.length) * 100) / 100 : 0);
