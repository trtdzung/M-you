/**
 * Recurring-series detection. Groups posted transactions by normalized merchant
 * + direction and flags any that occur in >= 3 distinct months (roughly monthly
 * cadence). Deterministic and pure.
 */

import type { Transaction, TransactionDirection } from "@/domain/models";
import { dateToMonthKey } from "./types";

export interface RecurringSeries {
  merchantNormalizedName: string;
  label: string;
  categoryId: string;
  direction: TransactionDirection;
  occurrences: number;
  distinctMonths: number;
  averageAmount: number;
  averageDayOfMonth: number;
  lastPostedAt: string;
  isExpense: boolean;
}

const MIN_MONTHS = 3;

/** VN-calendar "YYYY-MM" of an ISO instant (never a raw string slice); invalid → "invalid". */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "invalid" : dateToMonthKey(d);
}

export function detectRecurring(txns: Transaction[]): RecurringSeries[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.status !== "posted") continue;
    if (t.type === "transfer") continue;
    const key = `${t.merchantNormalizedName}|${t.direction}`;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const series: RecurringSeries[] = [];
  for (const rows of groups.values()) {
    const monthsSet = new Set(rows.map((r) => monthKey(r.postedAt)));
    if (monthsSet.size < MIN_MONTHS) continue;

    const sample = rows[0];
    const sumAmount = rows.reduce((s, r) => s + r.amount, 0);
    const sumDay = rows.reduce((s, r) => s + new Date(r.postedAt).getUTCDate(), 0);
    const last = rows.reduce((m, r) => (r.postedAt > m ? r.postedAt : m), rows[0].postedAt);

    series.push({
      merchantNormalizedName: sample.merchantNormalizedName,
      label: sample.merchantName,
      categoryId: sample.categoryId,
      direction: sample.direction,
      occurrences: rows.length,
      distinctMonths: monthsSet.size,
      averageAmount: Math.round(sumAmount / rows.length),
      averageDayOfMonth: Math.round(sumDay / rows.length),
      lastPostedAt: last,
      isExpense: sample.direction === "debit" && sample.type !== "card_payment",
    });
  }

  return series.sort((a, b) => b.averageAmount - a.averageAmount);
}
