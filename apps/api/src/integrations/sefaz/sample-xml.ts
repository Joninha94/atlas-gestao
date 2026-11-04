/**
 * Geração de XMLs fictícios (modo sandbox) no layout real: procNFe 4.00 e NFS-e nacional.
 * Permite testar captura, painéis, exportação e manifestação sem SEFAZ.
 */
import { createHash } from 'node:crypto';

const dv11 = (base: string) => {
  let w = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
};

export function accessKey(uf: string, aamm: string, cnpj: string, mod: string, serie: number, nNF: number) {
  const base = `${uf}${aamm}${cnpj}${mod}${String(serie).padStart(3, '0')}${String(nNF).padStart(9, '0')}1${String(nNF * 7).padStart(8, '0').slice(-8)}`;
  return base + dv11(base);
}

const SUPPLIERS = [
  { cnpj: '04252011000110', name: 'Distribuidora Nordeste Ltda', credit: true },
  { cnpj: '33000167000101', name: 'Petrolog Combustíveis SA', credit: true },
  { cnpj: '60701190000104', name: 'Transportes Rápido Ltda', credit: false },
  { cnpj: '07526557000100', name: 'Papelaria Central ME', credit: false },
];
const CUSTOMERS = [
  { cnpj: '11222333000181', name: 'Comercial Alfa Ltda' },
  { cnpj: '45997418000153', name: 'Mercado Beta Eireli' },
  { cnpj: '27865757000102', name: 'Restaurante Gama Ltda' },
];
const PRODUCTS = [
  { code: 'P001', name: 'Água mineral 500ml', ncm: '22011000', price: 1.9 },
  { code: 'P002', name: 'Refrigerante 2L', ncm: '22021000', price: 8.5 },
  { code: 'P003', name: 'Café torrado 500g', ncm: '09012100', price: 17.9 },
  { code: 'P004', name: 'Açúcar cristal 5kg', ncm: '17019900', price: 24.0 },
];

export function sampleNfe(opts: { clientCnpj: string; clientName: string; direction: 'ENTRADA' | 'SAIDA'; n: number; issuedAt: Date }) {
  const h = parseInt(createHash('md5').update(`${opts.clientCnpj}${opts.n}${opts.direction}`).digest('hex').slice(0, 6), 16);
  const other = opts.direction === 'ENTRADA' ? SUPPLIERS[h % SUPPLIERS.length] : CUSTOMERS[h % CUSTOMERS.length];
  const emit = opts.direction === 'ENTRADA' ? other : { cnpj: opts.clientCnpj, name: opts.clientName };
  const dest = opts.direction === 'ENTRADA' ? { cnpj: opts.clientCnpj, name: opts.clientName } : other;
  const aamm = `${String(opts.issuedAt.getUTCFullYear()).slice(2)}${String(opts.issuedAt.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = accessKey('27', aamm, emit.cnpj, '55', 1, opts.n);
  const items = Array.from({ length: 1 + (h % 3) }, (_, i) => {
    const p = PRODUCTS[(h + i) % PRODUCTS.length];
    const q = 10 + ((h >> (i + 2)) % 90);
    return { ...p, q, total: Math.round(p.price * q * 100) / 100 };
  });
  const vProd = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const vFrete = opts.direction === 'ENTRADA' ? Math.round(vProd * 0.05 * 100) / 100 : 0;
  const vNF = Math.round((vProd + vFrete) * 100) / 100;
  const det = items
    .map((it, i) => `<det nItem="${i + 1}"><prod><cProd>${it.code}</cProd><xProd>${it.name}</xProd><NCM>${it.ncm}</NCM><CFOP>${opts.direction === 'ENTRADA' ? '5102' : '5102'}</CFOP><qCom>${it.q}.0000</qCom><vUnCom>${it.price.toFixed(4)}</vUnCom><vProd>${it.total.toFixed(2)}</vProd></prod></det>`)
    .join('');
  return {
    accessKey: key,
    creditSupplier: opts.direction === 'ENTRADA' && (other as any).credit === true,
    xml: `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><cUF>27</cUF><mod>55</mod><serie>1</serie><nNF>${opts.n}</nNF><dhEmi>${opts.issuedAt.toISOString().slice(0, 19)}-03:00</dhEmi><tpNF>1</tpNF></ide><emit><CNPJ>${emit.cnpj}</CNPJ><xNome>${emit.name}</xNome><CRT>${opts.direction === 'ENTRADA' && (other as any).credit ? 3 : 1}</CRT></emit><dest><CNPJ>${dest.cnpj}</CNPJ><xNome>${dest.name}</xNome></dest>${det}<total><ICMSTot><vProd>${vProd.toFixed(2)}</vProd><vFrete>${vFrete.toFixed(2)}</vFrete><vICMS>${(vProd * 0.12).toFixed(2)}</vICMS><vPIS>${(vProd * 0.0065).toFixed(2)}</vPIS><vCOFINS>${(vProd * 0.03).toFixed(2)}</vCOFINS><vNF>${vNF.toFixed(2)}</vNF></ICMSTot></total></infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>${key}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`,
  };
}

export function sampleNfse(opts: { clientCnpj: string; clientName: string; direction: 'PRESTADO' | 'TOMADO'; n: number; issuedAt: Date }) {
  const h = parseInt(createHash('md5').update(`${opts.clientCnpj}${opts.n}${opts.direction}`).digest('hex').slice(0, 6), 16);
  const other = opts.direction === 'TOMADO' ? SUPPLIERS[h % SUPPLIERS.length] : CUSTOMERS[h % CUSTOMERS.length];
  const prest = opts.direction === 'PRESTADO' ? { cnpj: opts.clientCnpj, name: opts.clientName } : other;
  const toma = opts.direction === 'PRESTADO' ? other : { cnpj: opts.clientCnpj, name: opts.clientName };
  const v = 500 + (h % 450000) / 100;
  const key = `2704302${prest.cnpj}${String(opts.n).padStart(15, '0')}${String(h).padStart(8, '0').slice(0, 8)}`.slice(0, 50);
  return {
    accessKey: key,
    xml: `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00"><infNFSe Id="NFS${key}"><nNFSe>${opts.n}</nNFSe><dhProc>${opts.issuedAt.toISOString().slice(0, 19)}-03:00</dhProc><emit><CNPJ>${prest.cnpj}</CNPJ><xNome>${prest.name}</xNome></emit><valores><vLiq>${(v * 0.95).toFixed(2)}</vLiq></valores><DPS><infDPS><dCompet>${opts.issuedAt.toISOString().slice(0, 10)}</dCompet><prest><CNPJ>${prest.cnpj}</CNPJ></prest><toma><CNPJ>${toma.cnpj}</CNPJ><xNome>${toma.name}</xNome></toma><serv><cServ><xDescServ>Serviço de manutenção e suporte</xDescServ></cServ></serv><valores><vServPrest><vServ>${v.toFixed(2)}</vServ></vServPrest><trib><tribMun><pAliq>2.00</pAliq><vISSQN>${(v * 0.02).toFixed(2)}</vISSQN></tribMun></trib></valores></infDPS></DPS></infNFSe></NFSe>`,
  };
}
