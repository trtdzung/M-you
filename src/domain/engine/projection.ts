/**
 * Forward-looking projections: end-of-month cash estimate and cash runway.
 *
 * These are DERIVED, assumption-laden outputs — never facts. Every result is
 * forced to `source: "estimated"` so the UI badges it "ước tính" and never
 * presents it as bank-verified (invariant #5). Missing inputs stay unknown:
 * an in-window obligation with an unknown amount makes the whole EOM estimate
 * `"unknown"` (invariant #6) rather than silently dropping to a wrong number.
 *
 * Pure and deterministic: no React, no I/O, no `Date.now()` — `now` is passed in.
 */

import type { Account, DataSource } from "@/domain/models";
import type { CashflowResult } from "./cashflow";
import type { Obligation } from "./obligations";
import { isKnown, type Amount } from "./types";

/** Lightweight provenance for a derived projection. */
export interface ProjectionMeta {
  /** Always "estimated" — these outputs are projections, never verified. */
  source: DataSource;
  /** Oldest (worst-case) freshness across the inputs, or null if none. */
  freshness: string | null;
}

/** Liquid cash = available balance of current + savings accounts only. */
export function liquidBalance(accounts: Account[]): number {
  let sum = 0;
  for (const a of accounts) {
    if (a.type === "current" || a.type === "savings") sum += a.availableBalance;
  }
  return sum;
}

/** Oldest ISO timestamp among the inputs (worst-case freshness), or null. */
function oldest(values: (string | null | undefined)[]): string | null {
  let min: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}

/** Last calendar day of `now`'s UTC month. */
function daysInMonth(now: Date): number {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
}

/** End-of-month boundary (last moment of `now`'s UTC month) as ms. */
function endOfMonthMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999);
}

export interface EndOfMonthEstimate {
  /** Projected liquid cash at month end, or "unknown" if an input is unknown. */
  value: Amount;
  meta: ProjectionMeta;
}

/**
 * Estimate liquid cash at the end of the CURRENT month (Red Team C2 — only ever
 * called when `now` and the displayed month coincide). Full run-rate formula
 * (Validation S1):
 *
 *   liquidNow − remainingObligations − projectedDiscretionary
 *
 * Assumptions (all disclosed via the "ước tính" badge): discretionary continues
 * at the month-to-date daily run-rate, and obligations are paid on their due
 * date. (Income was removed from the product, so no inflow term is projected.)
 */
export function estimateEndOfMonth(
  accounts: Account[],
  cashflow: CashflowResult,
  obligations: Obligation[],
  now: Date,
): EndOfMonthEstimate {
  const nowMs = now.getTime();
  const eomMs = endOfMonthMs(now);

  const meta: ProjectionMeta = {
    source: "estimated",
    freshness: oldest([...accounts.map((a) => a.lastSyncedAt), cashflow.meta.freshness]),
  };

  const liquidNow = liquidBalance(accounts);

  // Obligations due between now and month end. Red Team C1: any unknown amount
  // in the window poisons the whole estimate to "unknown" — never coerced to 0.
  let remainingOblig = 0;
  for (const o of obligations) {
    const dueMs = new Date(o.dueDate).getTime();
    if (Number.isNaN(dueMs) || dueMs < nowMs || dueMs > eomMs) continue;
    if (!isKnown(o.amount)) return { value: "unknown", meta };
    remainingOblig += o.amount;
  }

  // Pro-rated discretionary run-rate for the rest of the month.
  const daysElapsed = now.getUTCDate();
  const daysRemaining = daysInMonth(now) - daysElapsed;
  const projDiscretionary =
    daysElapsed > 0 ? (cashflow.discretionary / daysElapsed) * daysRemaining : 0;

  const value = Math.round(liquidNow - remainingOblig - projDiscretionary);
  return { value, meta };
}

export interface CashRunway {
  /** Months of liquid cash at the given burn rate; null when incomputable. */
  months: number | null;
  meta: ProjectionMeta;
}

/**
 * How many months current liquid cash covers, at `avgMonthlyExpense` burn.
 * Returns `null` (never 0 or ∞) when the burn rate is 0 — the UI renders "—".
 */
export function cashRunwayMonths(accounts: Account[], avgMonthlyExpense: number): CashRunway {
  const liquid = liquidBalance(accounts);
  const months = avgMonthlyExpense > 0 ? liquid / avgMonthlyExpense : null;
  return {
    months,
    meta: { source: "estimated", freshness: oldest(accounts.map((a) => a.lastSyncedAt)) },
  };
}
