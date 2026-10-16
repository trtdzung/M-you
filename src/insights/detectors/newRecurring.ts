import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/** Summarizes recurring expense commitments (bills, subscriptions). */
export const newRecurring: Detector = (f) => {
  const bills = f.recurring.filter((r) => r.isExpense);
  if (bills.length === 0) return null;

  const total = bills.reduce((s, r) => s + r.averageAmount, 0);
  return buildInsight({
    id: `recurring:${f.monthKey}`,
    type: "recurring_summary",
    severity: "info",
    title: "Chi tiêu định kỳ",
    explanation: `Bạn có ${bills.length} khoản chi định kỳ, ước tính ${money(total)} mỗi tháng.`,
    facts: [fact("Số khoản định kỳ", bills.length), fact("Tổng ước tính mỗi tháng", total)],
    confidence: 0.8,
  });
};
