import type { DataSource, Insight, Transaction } from "@/domain/models";
import { POOL_DONOR_ID, POOL_DONOR_LABEL } from "@/domain/engine/jar-funding";
import type { Financials } from "@/state/useFinancials";
import type { MultiDetector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/**
 * "Hũ đã được bù" + "cần bù thủ công" (plan 260918-1120, Phase 07; balance/limit
 * split plan 260923, Phase 05). Reports the inter-jar coverage the derived engine
 * already applied — it is NOT a budget warning (that stays `jarPressure`), so it
 * never double-alarms the same overspend.
 *
 * Two axes, kept apart in the copy:
 *  - SỐ DƯ (balance): a cover exists because the jar ran out of money
 *    (`balance < 0` → "hết số dư"). Covers and the residual are balance facts.
 *  - HẠN MỨC (limit): `spent > limit` this month ("vượt hạn mức") — reported only
 *    as an extra fact, never as the covered amount.
 *
 * Two shapes, both `attention`, one Insight per jar:
 *  - COVERED: a jar that received a covering rebalance this period (a
 *    `dieu-chinh-hu`-tagged txn with `toJarId === huId`). Numbers trace to
 *    `jarRebalances` + the jar's lines — never the LLM (invariant #1). Each donor
 *    carries its `origin` provenance (invariant #5): an engine-auto rebalance is
 *    NOT presented as user-typed.
 *  - C5 RESIDUAL: a jar with `balance < 0` and NO covering rebalance — the durable
 *    "cần bù thủ công" state (never a silent overspend; persists across recompute).
 *    An unknown (`null`) balance never fires (invariant #6).
 */

const DONOR_ORIGIN_LABEL: Record<"auto" | "manual", string> = {
  auto: "tự động",
  manual: "thủ công",
};

type Donor = { donor: string; amount: number; origin: "auto" | "manual" };

/**
 * Covering rebalances grouped by the jar that received them (`toJarId`). A
 * `"pool"` target is a jar→pool lift, not a covered jar — skipped. Shared with
 * `jarPressure` so both detectors agree on which jars were covered (H3).
 */
export function coversByJar(rebalances: Transaction[]): Map<string, Donor[]> {
  const received = new Map<string, Donor[]>();
  for (const t of rebalances) {
    const meta = t.rebalance;
    if (!meta || meta.toJarId === POOL_DONOR_ID) continue;
    const list = received.get(meta.toJarId) ?? [];
    list.push({ donor: meta.fromJarId, amount: t.amount, origin: meta.origin });
    received.set(meta.toJarId, list);
  }
  return received;
}

/** Provenance of a jar's balance, read from its envelope (balance) line (invariant #5). */
export function balanceSourceOf(f: Financials, huId: string): { source?: DataSource } {
  const source = f.jarEnvelope.jars.find((j) => j.jarId === huId)?.source;
  return source ? { source } : {};
}

export const jarOverspendCovered: MultiDetector = (f) => {
  const insights: Insight[] = [];
  const lineByJar = new Map(f.jarBudget.lines.map((l) => [l.huId, l]));
  // A pool donor (`fromJarId: "pool"`, S2) reads as "Chưa phân bổ"; a jar no longer
  // in config reads as a deleted jar — never a raw id.
  const labelOf = (id: string) =>
    id === POOL_DONOR_ID ? POOL_DONOR_LABEL : (lineByJar.get(id)?.label ?? "hũ đã xoá");
  const received = coversByJar(f.jarRebalances);

  for (const [huId, donors] of received) {
    const line = lineByJar.get(huId);
    const label = labelOf(huId);
    const covered = donors.reduce((s, d) => s + d.amount, 0);
    // PLAN axis only — spent over the monthly limit, unrelated to the covered money.
    const overLimit = line && line.limit !== null ? Math.max(0, line.spent - line.limit) : 0;
    const donorText = donors.map((d) => `"${labelOf(d.donor)}"`).join(", ");
    const limitNote = overLimit > 0 ? ` Chi tháng này vượt hạn mức ${money(overLimit)}.` : "";

    insights.push(
      buildInsight({
        id: `jarOverspendCovered:${f.monthKey}:${huId}`,
        type: "jar_overspend_covered",
        severity: "attention",
        title: `Hũ "${label}" đã được bù số dư`,
        explanation: `Hũ "${label}" đã được bù ${money(covered)} từ ${donorText}.${limitNote}`,
        facts: [
          fact("Đã bù", covered, { period: f.monthKey }),
          ...donors.map((d) =>
            fact(`Bù từ "${labelOf(d.donor)}" (${DONOR_ORIGIN_LABEL[d.origin]})`, d.amount),
          ),
          ...(line && line.balance !== null ? [fact("Số dư", line.balance, balanceSourceOf(f, huId))] : []),
          ...(overLimit > 0 ? [fact("Vượt hạn mức", overLimit, { period: f.monthKey })] : []),
        ],
        confidence: 0.95,
        actionType: "review_jars",
      }),
    );
  }

  // C5 residual: jars out of money (balance < 0) with no covering rebalance — a
  // durable "cần bù thủ công" state (invariant #6). Balance axis only: a jar with
  // no limit can still run out of its deposited money.
  for (const line of f.jarBudget.lines) {
    if (line.balance === null || line.balance >= 0) continue;
    if (received.has(line.huId)) continue; // already covered above
    const shortfall = -line.balance;
    insights.push(
      buildInsight({
        id: `jarNeedsManualCover:${f.monthKey}:${line.huId}`,
        type: "jar_needs_manual_cover",
        severity: "attention",
        title: `Hũ "${line.label}" cần bù thủ công`,
        // `shortfall` is `−balance` (BALANCE axis — hết số dư), not `spent − limit`
        // (PLAN axis), so it can never be read as the "vượt hạn mức" figure.
        explanation: `Hũ "${line.label}" đã hết số dư, thiếu ${money(shortfall)} chưa được bù. Hãy chọn hũ nguồn để bù.`,
        facts: [
          fact("Cần bù", shortfall, { period: f.monthKey, ...balanceSourceOf(f, line.huId) }),
          fact("Đã tiêu", line.spent),
          ...(line.limit !== null ? [fact("Hạn mức", line.limit)] : []),
        ],
        confidence: 0.95,
        actionType: "review_jars",
      }),
    );
  }

  return insights.length > 0 ? insights : null;
};
