import { COLORS, EXPENSE_GROUP_PALETTE, INCOME_GROUP_PALETTE } from "../constants/colors.js";
import { findSubcategory, customExpenseRegistry } from "../constants/expenseCategories.js";
import { findIncomeSubcategory, customIncomeRegistry } from "../constants/incomeCategories.js";

export function expenseCategoryColor(subcategoryName) {
  const sub = findSubcategory(subcategoryName);
  if (!sub) return COLORS.inkMuted;
  return EXPENSE_GROUP_PALETTE[sub.group] || customExpenseRegistry.groupColors[sub.group] || COLORS.inkMuted;
}

export function incomeCategoryColor(subcategoryName) {
  const sub = findIncomeSubcategory(subcategoryName);
  if (!sub) return COLORS.inkMuted;
  return INCOME_GROUP_PALETTE[sub.group] || customIncomeRegistry.groupColors[sub.group] || COLORS.inkMuted;
}
