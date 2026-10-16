import { currentMonthKey } from "@/lib/demo-clock";
import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/**
 * Flags the most-pressured spending jar (over first, then near), matching the
 * PRODUCT example ("Hũ Giải trí đã dùng 82%, còn 12 ngày"). Deterministic — no
 * LLM. Coexists with `budgetPressure` (two altitudes); severity ranking orders
 * them, no cross-detector dedup in v1 (Red Team M10/AD2/F3).
 *
 * Two guards keep it honest:
 *  - H2: returns null off the current month, so a closed period never raises a
 *    "còn 0 ngày" false alarm (the Cashflow/Insights tabs can pick a past month).
 *  - C1: skips the unassigned bucket and any jar whose income basis is unresolved
 *    (`status "unknown"`, `pct null`) — an unknown allocation is never "pressure".
 */
export const jarPressure: Detector = (f) => {
  if (f.monthKey !== currentMonthKey()) return null;

  const candidates = f.jarLines.filter(
    (j) => !j.isUnassigned && j.status !== "unknown" && j.pct !== null && j.allocated !== null,
  );
  const over = candidates.filter((j) => j.status === "over").sort((a, b) => b.pct! - a.pct!);
  const near = candidates.filter((j) => j.status === "near").sort((a, b) => b.pct! - a.pct!);
  const line = over[0] ?? near[0];
  if (!line) return null;

  const isOver = line.status === "over";
  const pct = Math.round(line.pct! * 100);
  return buildInsight({
    id: `jarPressure:${f.monthKey}:${line.jarId}`,
    type: "jar_pressure",
    severity: isOver ? "urgent" : "attention",
    title: isOver ? `Vượt hũ "${line.label}"` : `Sắp vượt hũ "${line.label}"`,
    explanation: `Hũ "${line.label}" đã dùng ${money(line.used)} trên ${money(line.allocated!)} (${pct}%), còn ${line.daysLeft} ngày.`,
    facts: [
      fact("Đã chi", line.used),
      fact("Phân bổ", line.allocated!),
      fact("Số ngày còn lại", line.daysLeft),
    ],
    confidence: 0.95,
    actionType: "review_jars",
  });
};
