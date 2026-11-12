// Mapeamento Anexo Simples Nacional → parâmetros de atividade para Presumido/Real

export function cnaeAnnexToAtividade(annex) {
  const map = {
    "I":   { anexo: "I",   isComercio: true,  atividadeComercio: "comercio",  atividadeServicos: "servicos_gerais",        fatorR: false },
    "II":  { anexo: "II",  isComercio: true,  atividadeComercio: "industria", atividadeServicos: "servicos_gerais",        fatorR: false },
    "III": { anexo: "III", isComercio: false, atividadeComercio: "comercio",  atividadeServicos: "servicos_gerais",        fatorR: false },
    "IV":  { anexo: "IV",  isComercio: false, atividadeComercio: "comercio",  atividadeServicos: "servicos_gerais",        fatorR: false },
    "V":   { anexo: "V",   isComercio: false, atividadeComercio: "comercio",  atividadeServicos: "servicos_profissionais", fatorR: true  },
  };
  return map[annex] ?? map["III"];
}
