// Calcula o status financeiro de UMA parcela específica, considerando tanto o
// pagamento integral antigo (paidInstallments/paidInstallmentBanks/etc, que
// continua funcionando exatamente como antes) quanto pagamentos PARCIAIS novos
// (partialPayments), que podem ser feitos em mais de uma vez até completar o
// valor da parcela. O desconto abate de verdade o valor devido.
export function getInstallmentStatus(item, installmentNum) {
  // Receitas não têm parcelas — tratamos como uma "parcela única" (installments=1).
  const installments = item.installments || 1;
  const installmentValue = item.amount / installments;
  // For fixed income: paid status is per-month (tracked via paidInstallments keyed by month offset).
  // The global `received` flag cannot be used — it would mark ALL future months as paid.
  const fullyPaidLegacy = item.kind === "fixa"
    ? (item.paidInstallments || []).includes(installmentNum)
    : (item.received !== undefined ? !!item.received : (item.paidInstallments || []).includes(installmentNum));
  const partials = (item.partialPayments || {})[installmentNum] || [];

  const paidSoFar = partials.reduce((s, p) => s + (p.amountPaid || 0), 0);
  const discountSoFar = partials.reduce((s, p) => s + (p.desconto || 0), 0);
  const feesSoFar = partials.reduce((s, p) => s + (p.juros || 0) + (p.multa || 0), 0);
  const amountDue = Math.max(0, installmentValue - discountSoFar);
  const remaining = Math.max(0, amountDue - paidSoFar);

  const isFullyPaid = fullyPaidLegacy || (partials.length > 0 && remaining <= 0.005);
  const isPartiallyPaid = !isFullyPaid && partials.length > 0 && paidSoFar > 0;

  return {
    installmentValue, amountDue, paidSoFar, discountSoFar, feesSoFar, remaining,
    isFullyPaid, isPartiallyPaid, partials,
  };
}
