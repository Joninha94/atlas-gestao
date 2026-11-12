// Tabelas do Simples Nacional — Resolução CGSN nº 140/2018 / LC 123/2006
// rep: percentuais de repartição dos tributos por faixa (%)
// 6ª faixa: ICMS/ISS calculado via fórmula usando parâmetros da 5ª faixa

// Redistribuição proporcional do excesso de ISS (quando ISS efetivo > 5%)
// Percentuais fixos por Anexo conforme PGDAS-D
export const REDIST_ISS = {
  III: { IRPJ: 6.02,  CSLL: 5.26,  COFINS: 19.28, PIS: 4.18,  CPP: 65.26 },
  IV:  { IRPJ: 31.33, CSLL: 32.00, COFINS: 30.13, PIS: 6.54 },
  V:   { IRPJ: 30.07, CSLL: 16.34, COFINS: 18.43, PIS: 3.99,  CPP: 31.17 },
};

export const ANEXO_I = [
  { limite: 180000,   aliquota: 4.00,  deducao: 0,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 41.50, ICMS: 34.00 } },
  { limite: 360000,   aliquota: 7.30,  deducao: 5940,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 41.50, ICMS: 34.00 } },
  { limite: 720000,   aliquota: 9.50,  deducao: 13860,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 42.00, ICMS: 33.50 } },
  { limite: 1800000,  aliquota: 10.70, deducao: 22500,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 42.00, ICMS: 33.50 } },
  { limite: 3600000,  aliquota: 14.30, deducao: 87300,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 42.00, ICMS: 33.50 } },
  { limite: 4800000,  aliquota: 19.00, deducao: 378000,
    rep: { IRPJ: 13.50, CSLL: 10.00, COFINS: 28.27, PIS: 6.13, CPP: 42.10, ICMS: 0 },
    icmsFormula: { aliquota5a: 14.30, deducao5a: 87300, repICMS5a: 33.50 } },
];

export const ANEXO_II = [
  { limite: 180000,   aliquota: 4.50,  deducao: 0,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { limite: 360000,   aliquota: 7.80,  deducao: 5940,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { limite: 720000,   aliquota: 10.00, deducao: 13860,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { limite: 1800000,  aliquota: 11.20, deducao: 22500,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { limite: 3600000,  aliquota: 14.70, deducao: 85500,
    rep: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { limite: 4800000,  aliquota: 30.00, deducao: 720000,
    rep: { IRPJ: 8.50, CSLL: 7.50, COFINS: 20.96, PIS: 4.54, CPP: 23.50, IPI: 35.00, ICMS: 0 },
    icmsFormula: { aliquota5a: 14.70, deducao5a: 85500, repICMS5a: 32.00 } },
];

export const ANEXO_III = [
  { limite: 180000,   aliquota: 6.00,  deducao: 0,
    rep: { IRPJ: 4.00, CSLL: 3.50, COFINS: 12.82, PIS: 2.78, CPP: 43.40, ISS: 33.50 } },
  { limite: 360000,   aliquota: 11.20, deducao: 9360,
    rep: { IRPJ: 4.00, CSLL: 3.50, COFINS: 14.05, PIS: 3.05, CPP: 43.40, ISS: 32.00 } },
  { limite: 720000,   aliquota: 13.50, deducao: 17640,
    rep: { IRPJ: 4.00, CSLL: 3.50, COFINS: 13.64, PIS: 2.96, CPP: 43.40, ISS: 32.50 } },
  { limite: 1800000,  aliquota: 16.00, deducao: 35640,
    rep: { IRPJ: 4.00, CSLL: 3.50, COFINS: 13.64, PIS: 2.96, CPP: 43.40, ISS: 32.50 } },
  { limite: 3600000,  aliquota: 21.00, deducao: 125640,
    rep: { IRPJ: 4.00, CSLL: 3.50, COFINS: 12.82, PIS: 2.78, CPP: 43.40, ISS: 33.50 } },
  { limite: 4800000,  aliquota: 33.00, deducao: 648000,
    rep: { IRPJ: 35.00, CSLL: 15.00, COFINS: 16.03, PIS: 3.47, CPP: 30.50, ISS: 0 },
    issFormula: { aliquota5a: 21.00, deducao5a: 125640, repISS5a: 33.50 } },
];

// Anexo IV não tem CPP (INSS pago separadamente pelo empregador)
export const ANEXO_IV = [
  { limite: 180000,   aliquota: 4.50,  deducao: 0,
    rep: { IRPJ: 18.80, CSLL: 15.20, COFINS: 17.67, PIS: 3.83, ISS: 44.50 } },
  { limite: 360000,   aliquota: 9.00,  deducao: 8100,
    rep: { IRPJ: 19.80, CSLL: 15.20, COFINS: 20.55, PIS: 4.45, ISS: 40.00 } },
  { limite: 720000,   aliquota: 10.20, deducao: 12420,
    rep: { IRPJ: 20.80, CSLL: 15.20, COFINS: 19.73, PIS: 4.27, ISS: 40.00 } },
  { limite: 1800000,  aliquota: 14.00, deducao: 39780,
    rep: { IRPJ: 17.80, CSLL: 19.20, COFINS: 18.90, PIS: 4.10, ISS: 40.00 } },
  { limite: 3600000,  aliquota: 22.00, deducao: 183780,
    rep: { IRPJ: 18.80, CSLL: 19.20, COFINS: 18.08, PIS: 3.92, ISS: 40.00 } },
  { limite: 4800000,  aliquota: 33.00, deducao: 828000,
    rep: { IRPJ: 53.50, CSLL: 21.50, COFINS: 20.55, PIS: 4.45, ISS: 0 },
    issFormula: { aliquota5a: 22.00, deducao5a: 183780, repISS5a: 40.00 } },
];

export const ANEXO_V = [
  { limite: 180000,   aliquota: 15.50, deducao: 0,
    rep: { IRPJ: 25.00, CSLL: 15.00, COFINS: 14.10, PIS: 3.05, CPP: 28.85, ISS: 14.00 } },
  { limite: 360000,   aliquota: 18.00, deducao: 4500,
    rep: { IRPJ: 23.00, CSLL: 15.00, COFINS: 14.10, PIS: 3.05, CPP: 27.85, ISS: 17.00 } },
  { limite: 720000,   aliquota: 19.50, deducao: 9900,
    rep: { IRPJ: 24.00, CSLL: 15.00, COFINS: 14.92, PIS: 3.23, CPP: 23.85, ISS: 19.00 } },
  { limite: 1800000,  aliquota: 20.50, deducao: 17100,
    rep: { IRPJ: 21.00, CSLL: 15.00, COFINS: 15.74, PIS: 3.41, CPP: 23.85, ISS: 21.00 } },
  { limite: 3600000,  aliquota: 23.00, deducao: 62100,
    rep: { IRPJ: 23.00, CSLL: 12.50, COFINS: 14.10, PIS: 3.05, CPP: 23.85, ISS: 23.50 } },
  { limite: 4800000,  aliquota: 30.50, deducao: 540000,
    rep: { IRPJ: 35.00, CSLL: 15.50, COFINS: 16.44, PIS: 3.56, CPP: 29.50, ISS: 0 },
    issFormula: { aliquota5a: 23.00, deducao5a: 62100, repISS5a: 23.50 } },
];

export const ANEXOS = {
  I:   { tabela: ANEXO_I,   nome: "Anexo I — Comércio",            cor: "#3b82f6" },
  II:  { tabela: ANEXO_II,  nome: "Anexo II — Indústria",          cor: "#8b5cf6" },
  III: { tabela: ANEXO_III, nome: "Anexo III — Serviços (6%)",     cor: "#10b981" },
  IV:  { tabela: ANEXO_IV,  nome: "Anexo IV — Serviços (4.5%)",    cor: "#f59e0b" },
  V:   { tabela: ANEXO_V,   nome: "Anexo V — Serviços (15.5%)",    cor: "#ef4444" },
};

export const LIMITE_SIMPLES = 4800000;
export const LIMITE_MEI = 81000;
