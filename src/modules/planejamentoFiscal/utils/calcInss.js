import { INSS_CPP, INSS_RAT, SISTEMA_S_PADRAO, FGTS_PERCENTUAL } from "../constants/parametros2026.js";

function rnd(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula o INSS Patronal mensal.
 *
 * @param {object} p
 * @param {number}  p.folhaMensal    Total de salários + pró-labore no mês
 * @param {string}  p.grauRisco      "leve" | "medio" | "grave" (RAT/SAT)
 * @param {number}  p.fap            Fator Acidentário de Prevenção (0,50 a 2,00)
 * @param {number}  p.pctSistemaS    % contribuições a terceiros (default 5,8%)
 * @param {boolean} p.incluirFGTS    Se true, inclui FGTS no total
 * @returns {object}
 */
export function calcInssPatronal({
  folhaMensal  = 0,
  grauRisco    = "medio",
  fap          = 1.0,
  pctSistemaS  = SISTEMA_S_PADRAO,
  incluirFGTS  = false,
}) {
  const cpp      = rnd(folhaMensal * (INSS_CPP / 100));
  const ratBase  = INSS_RAT[grauRisco] ?? INSS_RAT.medio;
  // FAP ajusta o RAT dentro do intervalo [0,50; 2,00]
  const ratAjust = rnd(ratBase * Math.max(0.5, Math.min(2.0, fap)));
  const rat      = rnd(folhaMensal * (ratAjust / 100));
  const sistemaS = rnd(folhaMensal * (Math.max(0, pctSistemaS) / 100));
  const fgts     = rnd(folhaMensal * (FGTS_PERCENTUAL / 100));

  const totalSemFgts    = rnd(cpp + rat + sistemaS);
  const totalComFgts    = rnd(totalSemFgts + fgts);
  const pctTotalFolha   = folhaMensal > 0 ? rnd(totalSemFgts   / folhaMensal * 100) : 0;
  const pctTotalComFgts = folhaMensal > 0 ? rnd(totalComFgts   / folhaMensal * 100) : 0;

  return {
    cpp, ratBase, ratAjust, rat, sistemaS, fgts,
    totalSemFgts, totalComFgts, pctTotalFolha, pctTotalComFgts,
    detalhe: [
      { label: "CPP — Contribuição Patronal Previdenciária",         pct: INSS_CPP,      valor: cpp      },
      { label: `RAT/SAT (base ${ratBase}% × FAP ${fap.toFixed(2)})`, pct: ratAjust,      valor: rat      },
      { label: "Sistema S / Contribuições a Terceiros",               pct: pctSistemaS,   valor: sistemaS },
      ...(incluirFGTS ? [{ label: "FGTS (não é tributo)", pct: FGTS_PERCENTUAL, valor: fgts }] : []),
    ],
  };
}
