import { currentMonthKey } from "@/lib/demo-clock";
import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/**
 * Jar budget signal (Model A). Two non-blocking warnings, in priority order:
 *  1. Over-allocated: the "Chưa phân bổ" residual is negative — the user divided
 *     more than the balance (`Σ chia > số dư`). Fix the setup, not spending.
 *  2. Over-budget: a jar's period spend exceeds its earmark ("chia") — a budget
 *     breach, since "chia" doubles as the monthly spending reference (Validation).
 *
 * Deterministic — no LLM. Coexists with `budgetPressure` (two altitudes); the
 * existing no-cross-dedup precedent stands — severity ranking orders them, no new
 * cross-detector dedup (red-team #6). H2 guard: only the current month, so a
 * closed period never raises a stale warning.
 */
export const jarPressure: Detector = (f) => {
  if (f.monthKey !== currentMonthKey()) return null;
  if (f.jarPartition.status !== "ok") return null;

  const residual = f.jarPartition.lines.find((l) => l.isResidual);
  if (residual?.isOverAllocated) {
    const over = -residual.earmark;
    return buildInsight({
      id: `jarPressure:${f.monthKey}:over-allocated`,
      type: "jar_pressure",
      severity: "urgent",
      title: "Đã chia vượt số dư",
      explanation: `Bạn đã chia vượt số dư ${money(over)} — giảm bớt một hũ để cân lại.`,
      facts: [fact("Vượt", over)],
      confidence: 0.95,
      actionType: "review_jars",
    });
  }

  const breaches = f.jarPartition.lines
    .filter((l) => !l.isResidual && l.isOverBudget)
    .sort((a, b) => b.spentThisPeriod - b.earmark - (a.spentThisPeriod - a.earmark));
  const line = breaches[0];
  if (!line) return null;

  const over = line.spentThisPeriod - line.earmark;
  return buildInsight({
    id: `jarPressure:${f.monthKey}:${line.jarId}`,
    type: "jar_pressure",
    severity: "attention",
    title: `Vượt ngân sách hũ "${line.label}"`,
    explanation: `Hũ "${line.label}": đã tiêu ${money(line.spentThisPeriod)} trên phần chia ${money(line.earmark)}, vượt ngân sách ${money(over)}.`,
    facts: [
      fact("Đã tiêu", line.spentThisPeriod),
      fact("Phần chia", line.earmark),
      fact("Vượt", over),
    ],
    confidence: 0.95,
    actionType: "review_jars",
  });
};
