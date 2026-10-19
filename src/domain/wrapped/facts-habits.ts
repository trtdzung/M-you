/**
 * Habits: spend by VN weekday and weekend share. Every counted row participates,
 * so Σ weekday spend == total spend (one rule, checked by the cross-fact tests).
 * No peak calendar day, no hour-of-day (the mock hour is constant).
 *
 * `weekend-share-excl-person` is the SAME share over rows that are not a person
 * counterparty; it feeds the archetype only, so a transfer to a friend can never
 * decide a personality label (the all-rows `weekend-share` keeps the identity).
 */

import { makeFact, pctOf, provenanceOf } from "./wrapped-fact";
import { countedRows, isPersonCounterparty, vnWeekday } from "./wrapped-txn-rules";
import type { WrappedContext, WrappedSlide } from "./wrapped-types";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0 = Chủ nhật .. 6 = Thứ bảy (VN calendar)
const WEEKEND = new Set<number>([0, 6]);

export function habitsSlide(ctx: WrappedContext): WrappedSlide {
  const rows = countedRows(ctx.input.transactions, ctx.period);
  const byWeekday = new Map<number, number>();
  let total = 0;
  let weekend = 0;
  let merchantTotal = 0;
  let merchantWeekend = 0;
  for (const { txn, contribution } of rows) {
    const day = vnWeekday(txn.postedAt);
    if (day === null) continue;
    byWeekday.set(day, (byWeekday.get(day) ?? 0) + contribution);
    total += contribution;
    if (WEEKEND.has(day)) weekend += contribution;
    if (!isPersonCounterparty(txn)) {
      merchantTotal += contribution;
      if (WEEKEND.has(day)) merchantWeekend += contribution;
    }
  }
  if (rows.length === 0) return { id: "habits", available: false, facts: [] };

  const provenance = provenanceOf(rows.map((r) => r.txn));
  const dayAssumption = "Thứ trong tuần theo lịch Việt Nam: 0 = Chủ nhật, 1 = Thứ hai, … 6 = Thứ bảy";

  let peak: number = WEEKDAYS[0];
  for (const day of WEEKDAYS) {
    if ((byWeekday.get(day) ?? 0) > (byWeekday.get(peak) ?? 0)) peak = day;
  }

  const facts = WEEKDAYS.map((day) =>
    makeFact(`weekday.${day}.spend`, byWeekday.get(day) ?? 0, "vnd", ctx.period, provenance),
  );
  facts.push(
    makeFact("peak-weekday", peak, "count", ctx.period, provenance, dayAssumption),
    makeFact("weekend-share", pctOf(weekend, total), "pct", ctx.period, provenance, "Cuối tuần = Thứ bảy và Chủ nhật"),
    makeFact(
      "weekend-share-excl-person",
      pctOf(merchantWeekend, merchantTotal),
      "pct",
      ctx.period,
      provenance,
      "Cuối tuần = Thứ bảy và Chủ nhật; không gồm chuyển khoản cho cá nhân",
    ),
  );
  return { id: "habits", available: true, facts };
}
