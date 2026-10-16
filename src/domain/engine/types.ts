/**
 * Shared engine types. The engine is pure: canonical models in, typed results
 * out, no React/provider/I-O. Values that may be missing use the `"unknown"`
 * sentinel — never a silent 0. Every aggregate carries period/source/freshness.
 */

import type { DataSource } from "@/domain/models";

export interface Period {
  /** ISO timestamp, inclusive lower bound. */
  from: string;
  /** ISO timestamp, inclusive upper bound. */
  to: string;
  /** Human label, e.g. "09/2026". */
  label: string;
}

/** An amount that may be genuinely unknown. */
export type Amount = number | "unknown";

export const UNKNOWN: "unknown" = "unknown";

export function isKnown(a: Amount): a is number {
  return a !== "unknown";
}

export interface SourceCoverage {
  /** Distinct provenance labels present in the underlying records. */
  sources: DataSource[];
  knownCount: number;
  unknownCount: number;
}

export interface AggregateMeta {
  period: Period;
  sourceCoverage: SourceCoverage;
  /** ISO of the most recent underlying record, or null if none. */
  freshness: string | null;
}

/** Build a month period (0-based month) with ISO bounds and a VN label. */
export function monthPeriod(year: number, month: number): Period {
  const from = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)).toISOString();
  return { from, to, label: `${String(month + 1).padStart(2, "0")}/${year}` };
}

/** Build a month period from a "YYYY-MM" key. */
export function monthPeriodFromKey(key: string): Period {
  const [y, m] = key.split("-").map(Number);
  return monthPeriod(y, m - 1);
}

export function coverageOf(sources: DataSource[], knownCount: number, unknownCount: number): SourceCoverage {
  return { sources: Array.from(new Set(sources)), knownCount, unknownCount };
}

/** "YYYY-MM" key for a date's UTC month. */
export function dateToMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Add `delta` months to a "YYYY-MM" key (delta may be negative). */
export function addMonthsToKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return dateToMonthKey(new Date(Date.UTC(y, m - 1 + delta, 1)));
}
