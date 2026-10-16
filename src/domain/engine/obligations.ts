/**
 * Upcoming obligations within a horizon: liability payments (from due dates)
 * and predicted next occurrences of recurring bills. Amounts that are not known
 * stay `"unknown"` rather than defaulting to 0.
 */

import type { DataSource, Liability } from "@/domain/models";
import type { RecurringSeries } from "./recurring";
import type { Amount } from "./types";

export interface Obligation {
  id: string;
  label: string;
  amount: Amount;
  dueDate: string;
  kind: "liability" | "recurring";
  source: DataSource;
}

export interface ObligationOptions {
  now?: Date;
  horizonDays?: number;
}

function within(dueMs: number, nowMs: number, horizonMs: number): boolean {
  return dueMs >= nowMs && dueMs <= nowMs + horizonMs;
}

/** Next date matching `dayOfMonth` on or after `now`. */
function nextOccurrence(now: Date, dayOfMonth: number): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let candidate = new Date(Date.UTC(y, m, dayOfMonth, 10));
  if (candidate.getTime() < now.getTime()) {
    candidate = new Date(Date.UTC(y, m + 1, dayOfMonth, 10));
  }
  return candidate.toISOString();
}

export function upcomingObligations(
  recurring: RecurringSeries[],
  liabilities: Liability[],
  options: ObligationOptions = {},
): Obligation[] {
  const now = options.now ?? new Date();
  const horizonMs = (options.horizonDays ?? 30) * 86_400_000;
  const nowMs = now.getTime();
  const out: Obligation[] = [];

  for (const l of liabilities) {
    if (!l.dueDate) continue;
    const dueMs = new Date(l.dueDate).getTime();
    if (Number.isNaN(dueMs) || !within(dueMs, nowMs, horizonMs)) continue;
    out.push({
      id: l.id,
      label: l.name,
      amount: l.minimumPayment ?? "unknown",
      dueDate: l.dueDate,
      kind: "liability",
      source: l.source,
    });
  }

  for (const r of recurring) {
    if (!r.isExpense) continue;
    const dueDate = nextOccurrence(now, r.averageDayOfMonth);
    const dueMs = new Date(dueDate).getTime();
    if (!within(dueMs, nowMs, horizonMs)) continue;
    out.push({
      id: `rec_${r.merchantNormalizedName}`,
      label: r.label,
      amount: r.averageAmount,
      dueDate,
      kind: "recurring",
      source: "mock",
    });
  }

  return out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}
