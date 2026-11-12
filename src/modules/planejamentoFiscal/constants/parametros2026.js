// Parâmetros tributários — ano-calendário 2026
// Nunca hardcodar alíquotas nos motores de cálculo; importar sempre deste arquivo.
// Para atualizar em exercícios futuros: criar parametros2027.js e ajustar imports.

// ── IRPJ ─────────────────────────────────────────────────────────────────────
// RIR/2018 (Decreto 9.580/2018) arts. 225-226
export const IRPJ_ALIQUOTA              = 15;          // %
export const IRPJ_ADICIONAL             = 10;          // % sobre excedente
export const IRPJ_ADICIONAL_LIMITE_TRIM = 60_000;      // R$/trimestre
export const IRPJ_ADICIONAL_LIMITE_ANUAL = 240_000;    // R$/ano

// ── CSLL ─────────────────────────────────────────────────────────────────────
// Lei 7.689/1988 art. 3º
export const CSLL_ALIQUOTA = 9; // %

// ── PIS / COFINS ─────────────────────────────────────────────────────────────
export const PIS_CUMULATIVO        = 0.65; // % — Lei 9.715/1998 (Presumido)
export const COFINS_CUMULATIVO     = 3.00; // % — Lei 9.718/1998
export const PIS_NAO_CUMULATIVO    = 1.65; // % — Lei 10.637/2002 (Real)
export const COFINS_NAO_CUMULATIVO = 7.60; // % — Lei 10.833/2003

// ── Percentuais de presunção — Lucro Presumido ────────────────────────────────
// Lei 9.249/1995 art. 15 (IRPJ) e art. 20 (CSLL)
export const PRESUNCAO = {
  combustiveis:           { label: "Revenda de combustíveis e derivados",        irpj:  1.6, csll: 12 },
  comercio:               { label: "Comércio em geral (revenda de mercadorias)",  irpj:  8,   csll: 12 },
  industria:              { label: "Indústria / Fabricação",                      irpj:  8,   csll: 12 },
  transp_cargas:          { label: "Transporte de cargas",                        irpj:  8,   csll: 12 },
  transp_passageiros:     { label: "Transporte de passageiros",                   irpj: 16,   csll: 12 },
  servicos_hospitalares:  { label: "Serviços hospitalares e similares",           irpj:  8,   csll: 12 },
  servicos_gerais:        { label: "Serviços em geral",                           irpj: 32,   csll: 32 },
  servicos_profissionais: { label: "Serviços profissionais (TI, consultoria…)",   irpj: 32,   csll: 32 },
  intermediacao:          { label: "Intermediação de negócios / adm. de bens",    irpj: 32,   csll: 32 },
};

// ── INSS Patronal ─────────────────────────────────────────────────────────────
// Lei 8.212/1991; Decreto 3.048/1999
export const INSS_CPP         = 20;                           // % — Contribuição Patronal
export const INSS_RAT         = { leve: 1, medio: 2, grave: 3 }; // % RAT/SAT por grau de risco
export const SISTEMA_S_PADRAO = 5.8;                          // % — terceiros (FPAS 833 padrão)
export const FGTS_PERCENTUAL  = 8;                            // % — não é tributo, mas compõe custo

// ── Retenções na fonte (PJ → PJ) ─────────────────────────────────────────────
// RIR/2018 arts. 714-716; IN RFB 1.234/2012
export const IRRF_SERVICO_PROFISSIONAL = 1.5;  // % — serviços técnicos/profissionais
export const IRRF_LIMPEZA_SEGURANCA    = 1.0;  // % — limpeza, segurança, conservação
export const CSRF_PCC                  = 4.65; // % — PIS 0,65% + COFINS 3% + CSLL 1%
export const INSS_CESSAO_MAO_OBRA      = 11;   // % — cessão/empreitada de mão de obra
export const LIMITE_DISPENSA_RETENCAO  = 10;   // R$ — dispensa quando IRRF/CSRF ≤ este valor

// ── Limites e tetos ──────────────────────────────────────────────────────────
export const LIMITE_SIMPLES         = 4_800_000;  // R$/ano — LC 123/2006 art. 3º
export const SUBLIMITE_SIMPLES      = 3_600_000;  // R$/ano — ICMS/ISS saem do DAS acima deste
export const LIMITE_PRESUMIDO       = 78_000_000; // R$/ano — RIR/2018 art. 587
export const LIMITE_COMPENSACAO     = 30;          // % trava de compensação — Lei 9.065/1995 art. 15
export const FATOR_R_MINIMO         = 0.28;        // 28% — LC 123/2006 §5º-J

// ── Mapa atividade → parâmetros dos três regimes ─────────────────────────────
export const ATIVIDADE_PARA_SIMPLES = {
  comercio:           { anexo: "I",   isComercio: true,  atividadeComercio: "comercio",          atividadeServicos: null,                    fatorR: false },
  industria:          { anexo: "II",  isComercio: true,  atividadeComercio: "industria",         atividadeServicos: null,                    fatorR: false },
  svc_geral:          { anexo: "III", isComercio: false, atividadeComercio: null,                atividadeServicos: "servicos_gerais",        fatorR: false },
  svc_prof:           { anexo: "V",   isComercio: false, atividadeComercio: null,                atividadeServicos: "servicos_profissionais", fatorR: true  },
  svc_hosp:           { anexo: "III", isComercio: false, atividadeComercio: null,                atividadeServicos: "servicos_hospitalares",  fatorR: false },
  svc_especial:       { anexo: "IV",  isComercio: false, atividadeComercio: null,                atividadeServicos: "servicos_gerais",        fatorR: false },
  transp_passageiros: { anexo: "III", isComercio: false, atividadeComercio: null,                atividadeServicos: "transp_passageiros",     fatorR: false },
};

export const ATIVIDADE_LABELS = {
  comercio:           "Comércio em geral (varejo / atacado)",
  industria:          "Indústria / Fabricação",
  svc_geral:          "Serviços gerais (não profissionais)",
  svc_prof:           "Serviços profissionais (TI, consultoria, advocacia…)",
  svc_hosp:           "Serviços de saúde / hospitalares",
  svc_especial:       "Serviços especiais (construção, vigilância)",
  transp_passageiros: "Transporte de passageiros",
};
