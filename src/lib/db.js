// Conversão entre o formato usado pelo app (camelCase, igual ao app original)
// e as colunas do Supabase (snake_case). Mantém toda a lógica de negócio do
// app trabalhando exatamente com a mesma forma de objeto de sempre — só a
// borda de persistência muda.

export function bankFromDb(row) {
  return { id: row.id, name: row.name, color: row.color, initialBalance: Number(row.initial_balance) };
}
export function bankToDb(b, userId) {
  return { id: b.id, user_id: userId, name: b.name, color: b.color, initial_balance: b.initialBalance };
}

export function cardFromDb(row) {
  return {
    id: row.id, name: row.name, color: row.color, dueDay: row.due_day,
    billingStartMonth: row.billing_start_month, autoExpense: row.auto_expense,
    autoExpensePayments: row.auto_expense_payments || {},
    creditLimit: Number(row.credit_limit) || 0,
  };
}
export function cardToDb(c, userId) {
  return {
    id: c.id, user_id: userId, name: c.name, color: c.color, due_day: c.dueDay,
    billing_start_month: c.billingStartMonth, auto_expense: !!c.autoExpense,
    auto_expense_payments: c.autoExpensePayments || {},
    credit_limit: c.creditLimit || 0,
  };
}

export function cardItemFromDb(row) {
  return {
    id: row.id, cardId: row.card_id, desc: row.description, category: row.category || "",
    amount: Number(row.amount), date: row.date,
    installments: row.installments, paidInstallments: row.paid_installments || [],
    paidInstallmentBanks: row.paid_installment_banks || {}, paidInstallmentDates: row.paid_installment_dates || {},
    paidInstallmentLateFees: row.paid_installment_late_fees || {}, paidInstallmentWasLate: row.paid_installment_was_late || {},
    partialPayments: row.partial_payments || {},
  };
}
export function cardItemToDb(item, userId) {
  return {
    id: item.id, user_id: userId, card_id: item.cardId, description: item.desc, category: item.category || "",
    amount: item.amount, date: item.date,
    installments: item.installments, paid_installments: item.paidInstallments || [],
    paid_installment_banks: item.paidInstallmentBanks || {}, paid_installment_dates: item.paidInstallmentDates || {},
    paid_installment_late_fees: item.paidInstallmentLateFees || {}, paid_installment_was_late: item.paidInstallmentWasLate || {},
    partial_payments: item.partialPayments || {},
  };
}

export function incomeFromDb(row) {
  return {
    id: row.id, source: row.source, amount: Number(row.amount), date: row.date, kind: row.kind,
    installments: row.installments || 1,
    category: row.category, received: row.received, bankId: row.bank_id,
    receivedDate: row.received_date, partialPayments: row.partial_payments || {},
    paidInstallments: row.paid_installments || [],
    paidInstallmentBanks: row.paid_installment_banks || {},
    paidInstallmentDates: row.paid_installment_dates || {},
    endMonth: row.end_month || null,
    skippedMonths: row.skipped_months || [],
  };
}
export function incomeToDb(inc, userId) {
  return {
    id: inc.id, user_id: userId, source: inc.source, amount: inc.amount, date: inc.date, kind: inc.kind,
    installments: inc.installments || 1,
    category: inc.category, received: !!inc.received, bank_id: inc.bankId || null,
    received_date: inc.receivedDate || null, partial_payments: inc.partialPayments || {},
    paid_installments: inc.paidInstallments || [],
    paid_installment_banks: inc.paidInstallmentBanks || {},
    paid_installment_dates: inc.paidInstallmentDates || {},
    end_month: inc.endMonth || null,
    skipped_months: inc.skippedMonths || [],
  };
}

export function expenseFromDb(row) {
  return {
    id: row.id, desc: row.description, category: row.category, amount: Number(row.amount), date: row.date,
    installments: row.installments, currentInstallment: row.current_installment, kind: row.kind,
    frequency: row.frequency, paidInstallments: row.paid_installments || [],
    paidInstallmentBanks: row.paid_installment_banks || {}, paidInstallmentDates: row.paid_installment_dates || {},
    paidInstallmentLateFees: row.paid_installment_late_fees || {}, paidInstallmentWasLate: row.paid_installment_was_late || {},
    partialPayments: row.partial_payments || {},
    skippedInstallments: row.skipped_installments || [],
  };
}
export function expenseToDb(exp, userId) {
  return {
    id: exp.id, user_id: userId, description: exp.desc, category: exp.category, amount: exp.amount, date: exp.date,
    installments: exp.installments, current_installment: exp.currentInstallment, kind: exp.kind,
    frequency: exp.frequency || null, paid_installments: exp.paidInstallments || [],
    paid_installment_banks: exp.paidInstallmentBanks || {}, paid_installment_dates: exp.paidInstallmentDates || {},
    paid_installment_late_fees: exp.paidInstallmentLateFees || {}, paid_installment_was_late: exp.paidInstallmentWasLate || {},
    partial_payments: exp.partialPayments || {},
    skipped_installments: exp.skippedInstallments || [],
  };
}

export function cardSubscriptionFromDb(row) {
  return {
    id: row.id, cardId: row.card_id, desc: row.description, category: row.category || "",
    amount: Number(row.amount), billingDay: row.billing_day, startDate: row.start_date,
    active: !!row.active, paidMonths: row.paid_months || {},
  };
}
export function cardSubscriptionToDb(sub, userId) {
  return {
    id: sub.id, user_id: userId, card_id: sub.cardId, description: sub.desc, category: sub.category || "",
    amount: sub.amount, billing_day: sub.billingDay, start_date: sub.startDate,
    active: !!sub.active, paid_months: sub.paidMonths || {},
  };
}

export function customCategoryFromDb(row) {
  return { id: row.id, name: row.name, group: row.group_name, icon: row.icon, color: row.color };
}
export function customCategoryToDb(cat, type, userId) {
  return {
    id: cat.id, user_id: userId, type, name: cat.name, group_name: cat.group,
    icon: cat.icon || "🏷️", color: cat.color,
  };
}
