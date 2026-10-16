/**
 * Shared "pressure" primitives — the ok/near/over classification and days-left
 * math reused by both budgets and spending jars (DRY). Behaviour is the exact
 * rule budgets have always used; extracting it keeps the two features in lockstep
 * without copy-paste drift.
 */

import type { Period } from "./types";

export const NEAR_THRESHOLD = 0.8;

export type PressureStatus = "ok" | "near" | "over";

/** Classify usage against a limit. Non-positive limits are always "ok". */
export function statusOf(used: number, limit: number): PressureStatus {
  if (limit <= 0) return "ok";
  if (used > limit) return "over";
  if (used / limit >= NEAR_THRESHOLD) return "near";
  return "ok";
}

/** Whole days remaining in the period from `now` (>= 0). */
export function daysLeftIn(period: Period, now: Date): number {
  const end = new Date(period.to).getTime();
  const diff = end - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
}
