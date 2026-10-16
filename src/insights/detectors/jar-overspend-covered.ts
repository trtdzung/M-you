import type { Insight } from "@/domain/models";
import type { MultiDetector } from "../types";
import { buildInsight, fact, money } from "../narrate";

/**
 * "Vượt-hũ-đã-bù" + "cần bù thủ công" (plan 260918-1120, Phase 07). Reports the
 * inter-jar coverage the derived engine already applied — it is NOT a budget
 * warning (that stays `jarPressure`), so it never double-alarms the same overspend.
 *
 * Two shapes, both `attention`, one Insight per jar:
 *  - COVERED: a jar that received a covering rebalance this period (a
 *    `dieu-chinh-hu`-tagged txn with `toJarId === huId`). "Bạn đã tiêu vượt hũ X,
 *    đã bù … từ <donor>." Numbers trace to `jarRebalances` (the ledger) + the jar's
 *    `jarBudget` line — never the LLM (invariant #1). Each donor carries its
 *    `origin` (`auto`/`manual`) provenance (invariant #5, Minor-1): an engine-auto
 *    rebalance is NOT presented as user-typed.
 *  - C5 RESIDUAL: a jar over-budget (`remaining < 0`) with NO covering rebalance —
 *    the durable "cần bù thủ công" state a declined goal-confirm leaves behind
 *    (never a silent overspend; persists across recompute).
 *
 * Deterministic and pure. `spent` is untouched by rebalances (invariant #6), so the
 * overspend magnitude reads straight from `spent − limit`.
 */

const DONOR_ORIGIN_LABEL: Record<"auto" | "manual", string> = {
  auto: "tự động",
  manual: "thủ công",
};

export const jarOverspendCovered: MultiDetector = (f) => {
  const insights: Insight[] = [];
  const lineByJar = new Map(f.jarBudget.lines.map((l) => [l.huId, l]));
  const labelOf = (id: string) => lineByJar.get(id)?.label ?? id;

  // Group covering rebalances by the jar that received them (`toJarId`). A `"pool"`
  // target is a jar→pool lift, not a covered overspend — skip it.
  const received = new Map<string, { donor: string; amount: number; origin: "auto" | "manual" }[]>();
  for (const t of f.jarRebalances) {
    const meta = t.rebalance;
    if (!meta || meta.toJarId === "pool") continue;
    const list = received.get(meta.toJarId) ?? [];
    list.push({ donor: meta.fromJarId, amount: t.amount, origin: meta.origin });
    received.set(meta.toJarId, list);
  }

  for (const [huId, donors] of received) {
    const line = lineByJar.get(huId);
    const label = labelOf(huId);
    const covered = donors.reduce((s, d) => s + d.amount, 0);
    const overspend = line && line.limit !== null ? Math.max(0, line.spent - line.limit) : 0;
    const donorText = donors.map((d) => `"${labelOf(d.donor)}"`).join(", ");

    insights.push(
      buildInsight({
        id: `jarOverspendCovered:${f.monthKey}:${huId}`,
        type: "jar_overspend_covered",
        severity: "attention",
        title: `Vượt hũ "${label}" đã được bù`,
        explanation:
          overspend > 0
            ? `Bạn đã tiêu vượt hũ "${label}" ${money(overspend)}, đã bù ${money(covered)} từ ${donorText}.`
            : `Hũ "${label}" đã được bù ${money(covered)} từ ${donorText}.`,
        facts: [
          fact("Vượt hũ", overspend, { period: f.monthKey }),
          fact("Đã bù", covered),
          ...donors.map((d) =>
            fact(`Bù từ "${labelOf(d.donor)}" (${DONOR_ORIGIN_LABEL[d.origin]})`, d.amount),
          ),
        ],
        confidence: 0.95,
        actionType: "review_jars",
      }),
    );
  }

  // C5 residual: over-budget jars left unfunded (no covering rebalance) — a durable
  // "cần bù thủ công" state, surfaced so it is never a silent overspend (invariant #6).
  for (const line of f.jarBudget.lines) {
    if (line.limit === null || line.remaining === null || line.remaining >= 0) continue;
    if (received.has(line.huId)) continue; // already covered above
    const shortfall = -line.remaining;
    insights.push(
      buildInsight({
        id: `jarNeedsManualCover:${f.monthKey}:${line.huId}`,
        type: "jar_needs_manual_cover",
        severity: "attention",
        title: `Hũ "${line.label}" cần bù thủ công`,
        explanation: `Hũ "${line.label}" đã tiêu vượt ${money(shortfall)} chưa được bù. Hãy chọn hũ nguồn để bù.`,
        facts: [
          fact("Cần bù", shortfall, { period: f.monthKey }),
          fact("Đã tiêu", line.spent),
          fact("Hạn mức", line.limit),
        ],
        confidence: 0.95,
        actionType: "review_jars",
      }),
    );
  }

  return insights.length > 0 ? insights : null;
};
