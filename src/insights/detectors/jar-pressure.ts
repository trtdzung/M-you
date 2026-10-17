import { currentMonthKey } from "@/lib/demo-clock";
import type { Financials } from "@/state/useFinancials";
import type { Detector } from "../types";
import { buildInsight, fact, money } from "../narrate";
import { balanceSourceOf, coversByJar } from "./jar-overspend-covered";

/**
 * Per-hũ budget signal (BIDV wallet model, plan 260910-1626; balance/limit split
 * plan 260923, Phase 05). Flags the most-pressured jar with a SET monthly limit:
 * over-limit first, then near. Reads `jarBudget` — the single budget truth
 * (invariant #2); jars with no limit are `status: null` and never warn (a chưa-đặt
 * limit is unknown, not a breach — invariant #6).
 *
 * Two axes, kept distinct in the copy:
 *  - HẠN MỨC: `status` (spent vs the monthly limit) drives the title "vượt/sắp vượt
 *    hạn mức".
 *  - SỐ DƯ: `balance` drives severity + the balance fact. Over the limit AND out of
 *    money (`balance < 0`) → `urgent`; over the limit but the jar still holds money
 *    (deposited more than the plan) → `attention`. An unknown balance is omitted,
 *    never shown as 0.
 *
 * A jar that broke its plan but was covered back to `balance ≥ 0` by a rebalance is
 * ALREADY narrated by `jarOverspendCovered` — dropped here so the two never tell the
 * same story twice (H3). Deterministic, no LLM. H2 guard: current month only.
 */

type Line = Financials["jarBudget"]["lines"][number];

/** Balance-axis fact: "Cần bù" (positive) when out of money, else "Số dư". Unknown → none. */
function balanceFacts(f: Financials, line: Line) {
  if (line.balance === null) return [];
  const src = balanceSourceOf(f, line.huId);
  return [line.balance < 0 ? fact("Cần bù", -line.balance, src) : fact("Số dư", line.balance, src)];
}

function balanceNote(balance: number | null): string {
  if (balance === null) return "";
  return balance < 0 ? ` Hũ đã hết số dư, cần bù ${money(-balance)}.` : ` Số dư hũ còn ${money(balance)}.`;
}

export const jarPressure: Detector = (f) => {
  if (f.monthKey !== currentMonthKey()) return null;

  const covered = coversByJar(f.jarRebalances);
  const set = f.jarBudget.lines.filter((l) => l.limitState === "set" && l.limit !== null);
  const coveredBack = (l: Line) => covered.has(l.huId) && l.balance !== null && l.balance >= 0;
  const outOfMoney = (l: Line) => l.balance !== null && l.balance < 0;
  const byPct = (a: Line, b: Line) => (b.pct ?? 0) - (a.pct ?? 0);
  // Out-of-money breaches rank first (urgent), then over-limit jars that still hold money.
  const over = set.filter((l) => l.status === "over" && !coveredBack(l));
  const ranked = [...over.filter(outOfMoney).sort(byPct), ...over.filter((l) => !outOfMoney(l)).sort(byPct)];
  const near = set.filter((l) => l.status === "near").sort(byPct);
  const line = ranked[0] ?? near[0];
  if (!line) return null;

  const isOver = line.status === "over";
  const limit = line.limit as number;
  const pct = Math.round((line.pct ?? 0) * 100);
  return buildInsight({
    id: `jarPressure:${f.monthKey}:${line.huId}`,
    type: "jar_pressure",
    severity: isOver && outOfMoney(line) ? "urgent" : "attention",
    title: isOver ? `Vượt hạn mức hũ "${line.label}"` : `Sắp vượt hạn mức hũ "${line.label}"`,
    explanation: `Hũ "${line.label}": đã tiêu ${money(line.spent)} trên hạn mức ${money(limit)} (${pct}%).${balanceNote(line.balance)}`,
    facts: [
      fact("Đã tiêu", line.spent, { period: f.monthKey }),
      fact("Hạn mức", limit),
      ...balanceFacts(f, line),
    ],
    confidence: 0.95,
    actionType: "review_jars",
  });
};
