import { currentMonthKey } from "@/lib/demo-clock";
import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/**
 * Per-hũ budget signal (BIDV wallet model, plan 260910-1626). Flags the most-
 * pressured jar with a SET monthly limit: over-limit first (urgent), then near
 * (attention). Reads `jarBudget` — the single budget truth (invariant #2); jars
 * with no limit are `status: null` and never warn (a chưa-đặt limit is unknown,
 * not a breach — invariant #6).
 *
 * Deterministic — no LLM. This is now the app's sole budget warning: the legacy
 * per-category `budgetPressure` was retired in phase 08 so the two systems never
 * double-warn (H3). H2 guard: only the current month, so a closed period never
 * raises a stale warning.
 */
/** "Còn lại" when the jar still holds money, "Cần bù" (positive) when it does not. */
function balanceFact(remaining: number) {
  return remaining < 0 ? fact("Cần bù", -remaining) : fact("Còn lại", remaining);
}

export const jarPressure: Detector = (f) => {
  if (f.monthKey !== currentMonthKey()) return null;

  const set = f.jarBudget.lines.filter((l) => l.limitState === "set" && l.limit !== null);
  // Two axes since the balance/limit split: `status` is the PLAN axis (spent vs its
  // own limit), `remaining` is the BALANCE axis. A jar that broke its plan but was
  // refilled from another jar (`over` yet `remaining >= 0`, which can only happen
  // via a covering rebalance) is ALREADY narrated by `jarOverspendCovered` — drop it
  // here so the two never tell the same story twice (H3).
  const stillShort = (l: (typeof set)[number]) => (l.remaining ?? 0) < 0;
  const over = set
    .filter((l) => l.status === "over" && stillShort(l))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const near = set.filter((l) => l.status === "near").sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const line = over[0] ?? near[0];
  if (!line) return null;

  const isOver = line.status === "over";
  const limit = line.limit as number;
  const pct = Math.round((line.pct ?? 0) * 100);
  return buildInsight({
    id: `jarPressure:${f.monthKey}:${line.huId}`,
    type: "jar_pressure",
    severity: isOver ? "urgent" : "attention",
    title: isOver ? `Vượt hạn mức hũ "${line.label}"` : `Sắp vượt hạn mức hũ "${line.label}"`,
    explanation: `Hũ "${line.label}": đã tiêu ${money(line.spent)} trên hạn mức ${money(limit)} (${pct}%).`,
    facts: [
      fact("Đã tiêu", line.spent),
      fact("Hạn mức", limit),
      // A hũ cannot hold negative money, so "Còn lại" never carries a negative
      // figure. An `over` jar here is always `stillShort` (remaining < 0), so its
      // balance reads as a positive "Cần bù" instead — same rule the jar card,
      // `JarEnvelopeCard` and the Ngân sách header already follow.
      balanceFact(line.remaining ?? 0),
    ],
    confidence: 0.95,
    actionType: "review_jars",
  });
};
