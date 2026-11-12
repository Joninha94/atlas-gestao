import {
  IRRF_SERVICO_PROFISSIONAL, IRRF_LIMPEZA_SEGURANCA,
  CSRF_PCC, INSS_CESSAO_MAO_OBRA, LIMITE_DISPENSA_RETENCAO,
} from "../constants/parametros2026.js";

function rnd(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export const TIPOS_RETENCAO = {
  servico_profissional: {
    label: "Serviço profissional (TI, advocacia, consultoria, engenharia…)",
    irrf: IRRF_SERVICO_PROFISSIONAL,
    cessaoMaoObra: false,
    base: "IN RFB 1.234/2012, art. 30 inciso I",
  },
  limpeza_seguranca: {
    label: "Limpeza, conservação, segurança, vigilância, locação de mão de obra",
    irrf: IRRF_LIMPEZA_SEGURANCA,
    cessaoMaoObra: false,
    base: "IN RFB 1.234/2012, art. 30 inciso II",
  },
  cessao_mao_obra: {
    label: "Cessão ou empreitada de mão de obra (Lei 8.212/91 art. 31)",
    irrf: IRRF_LIMPEZA_SEGURANCA,
    cessaoMaoObra: true,
    base: "IN RFB 1.234/2012 + INSS 11% (Lei 8.212/91 art. 31)",
  },
};

/**
 * Calcula retenções na fonte em pagamento PJ tomador → PJ prestador.
 *
 * @param {object}  p
 * @param {number}  p.valorNota          Valor bruto da NF / fatura
 * @param {string}  p.tipoRetencao       Chave de TIPOS_RETENCAO
 * @param {boolean} p.prestadorSimples   Optante do Simples? → isenta CSRF/PCC
 * @param {number}  p.materialDeducao    Material/equip. a deduzir da base INSS (cessão)
 * @returns {object}
 */
export function calcRetencoes({
  valorNota         = 0,
  tipoRetencao      = "servico_profissional",
  prestadorSimples  = false,
  materialDeducao   = 0,
}) {
  const tipo = TIPOS_RETENCAO[tipoRetencao] ?? TIPOS_RETENCAO.servico_profissional;

  const irrfBruto = rnd(valorNota * (tipo.irrf / 100));
  const csrfBruto = !prestadorSimples ? rnd(valorNota * (CSRF_PCC / 100)) : 0;
  const baseINSS  = rnd(Math.max(0, valorNota - materialDeducao));
  const inss      = tipo.cessaoMaoObra ? rnd(baseINSS * (INSS_CESSAO_MAO_OBRA / 100)) : 0;

  // Dispensa: IRRF e CSRF individualmente dispensados quando ≤ R$ 10
  const dispensadoIRRF = irrfBruto > 0 && irrfBruto <= LIMITE_DISPENSA_RETENCAO;
  const dispensadoCSRF = csrfBruto > 0 && csrfBruto <= LIMITE_DISPENSA_RETENCAO;

  const irrf   = dispensadoIRRF ? 0 : irrfBruto;
  const csrf   = dispensadoCSRF ? 0 : csrfBruto;
  const totalRetido = rnd(irrf + csrf + inss);
  const liquido     = rnd(valorNota - totalRetido);

  return {
    valorNota, tipo, prestadorSimples, materialDeducao,
    irrfBruto, csrfBruto, inss,
    irrf, csrf, totalRetido, liquido,
    dispensadoIRRF, dispensadoCSRF,
    detalhe: [
      {
        label: `IRRF ${tipo.irrf}%`,
        valor: irrf,
        bruto: irrfBruto,
        dispensado: dispensadoIRRF,
        obs: dispensadoIRRF ? "Dispensado (valor ≤ R$ 10)" : "",
      },
      {
        label: `CSRF/PCC ${CSRF_PCC}%`,
        valor: csrf,
        bruto: csrfBruto,
        dispensado: dispensadoCSRF || prestadorSimples,
        obs: prestadorSimples
          ? "Dispensado — prestador Simples Nacional"
          : dispensadoCSRF ? "Dispensado (valor ≤ R$ 10)" : "",
      },
      ...(tipo.cessaoMaoObra ? [{
        label: `INSS Cessão ${INSS_CESSAO_MAO_OBRA}%`,
        valor: inss,
        bruto: inss,
        dispensado: false,
        obs: materialDeducao > 0 ? `Base deduzida de ${materialDeducao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em material` : "",
      }] : []),
    ],
  };
}
