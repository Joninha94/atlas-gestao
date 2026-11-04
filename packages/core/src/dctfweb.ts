/**
 * Regra de composição da guia da DCTFWeb (roteiro de referência):
 * - Se PIS/COFINS foram apurados no MESMO período da DCTFWeb (via MIT), a guia sai
 *   unificada com vencimento no dia 20.
 * - Se o cliente costuma pagar PIS/COFINS em guias separadas, o escritório pode marcar
 *   "enviar só INSS": o Monitor envia apenas a parte previdenciária e as demais guias
 *   seguem pela Comunicação ou pelas Tarefas.
 */

export interface DctfwebDebt {
  revenueCode: string;
  kind: 'PREVIDENCIARIO' | 'PIS' | 'COFINS' | 'IRRF' | 'CSLL' | 'OUTRO';
  amount: number;
}

export interface DctfwebPlan {
  mode: 'UNIFICADA' | 'SOMENTE_INSS' | 'SEPARADAS';
  dueDay: number;
  sendThroughMonitor: DctfwebDebt[];
  sendElsewhere: DctfwebDebt[];
}

export function planDctfwebGuide(
  debts: DctfwebDebt[],
  opts: { pisCofinsSamePeriod: boolean; sendOnlyInss: boolean },
): DctfwebPlan {
  const inss = debts.filter((d) => d.kind === 'PREVIDENCIARIO');
  const others = debts.filter((d) => d.kind !== 'PREVIDENCIARIO');

  if (opts.sendOnlyInss) {
    return { mode: 'SOMENTE_INSS', dueDay: 20, sendThroughMonitor: inss, sendElsewhere: others };
  }
  if (opts.pisCofinsSamePeriod) {
    return { mode: 'UNIFICADA', dueDay: 20, sendThroughMonitor: debts, sendElsewhere: [] };
  }
  return { mode: 'SEPARADAS', dueDay: 20, sendThroughMonitor: inss, sendElsewhere: others };
}
