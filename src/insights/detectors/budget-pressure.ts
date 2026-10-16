import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/** Flags the most-pressured budget (over first, then near). */
export const budgetPressure: Detector = (f) => {
  const over = f.budgetLines.filter((b) => b.status === "over").sort((a, b) => b.pct - a.pct);
  const near = f.budgetLines.filter((b) => b.status === "near").sort((a, b) => b.pct - a.pct);
  const line = over[0] ?? near[0];
  if (!line) return null;

  const isOver = line.status === "over";
  const pct = Math.round(line.pct * 100);
  return buildInsight({
    id: `budgetPressure:${f.monthKey}:${line.categoryId}`,
    type: "budget_pressure",
    severity: isOver ? "urgent" : "attention",
    title: isOver ? `Vượt ngân sách "${line.label}"` : `Sắp vượt ngân sách "${line.label}"`,
    explanation: `Danh mục "${line.label}" đã dùng ${money(line.used)} trên hạn mức ${money(line.limit)} (${pct}%).`,
    facts: [fact("Đã chi", line.used), fact("Hạn mức", line.limit)],
    confidence: 0.95,
    actionType: "review_budget",
  });
};
