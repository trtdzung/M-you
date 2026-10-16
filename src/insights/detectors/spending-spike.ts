import { CATEGORY_BY_ID } from "@/domain/models";
import type { Detector } from "../types";
import { buildInsight, fact, money, pctChange, prevLabel } from "../narrate";

/** Flags the largest category whose spend jumped vs the previous month. */
export const spendingSpike: Detector = (f) => {
  const prev = new Map(f.prevCashflow.byCategory.map((c) => [c.categoryId, c.amount]));
  let best: { cat: string; cur: number; prev: number; delta: number } | null = null;

  for (const c of f.cashflow.byCategory) {
    const p = prev.get(c.categoryId) ?? 0;
    if (p <= 0) continue;
    const delta = c.amount - p;
    if (c.amount > p * 1.3 && delta >= 500_000 && (!best || delta > best.delta)) {
      best = { cat: c.categoryId, cur: c.amount, prev: p, delta };
    }
  }
  if (!best) return null;

  const label = CATEGORY_BY_ID[best.cat]?.label ?? best.cat;
  const pct = pctChange(best.cur, best.prev);
  return buildInsight({
    id: `spendingSpike:${f.monthKey}:${best.cat}`,
    type: "spending_spike",
    severity: "attention",
    title: `Chi cho "${label}" tăng mạnh`,
    explanation: `Bạn đã chi ${money(best.cur)} cho "${label}", tăng ${money(best.delta)} (${pct}%) so với ${prevLabel(f.monthKey)}.`,
    facts: [
      fact(`Chi ${label} tháng này`, best.cur, { period: f.monthKey }),
      fact(`Chi ${label} tháng trước`, best.prev),
      fact("Chênh lệch", best.delta),
    ],
    comparisonPeriod: prevLabel(f.monthKey),
    confidence: 0.85,
  });
};
