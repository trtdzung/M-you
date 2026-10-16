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

/**
 * Business time zone: Vietnam, a FIXED UTC+7 (no DST). Month keys and month
 * periods are VN calendar months — a txn at 00:30 01/10 (+07:00) is October,
 * even though its UTC instant is still 30/09. Period bounds stay canonical UTC
 * ISO strings, so callers must compare INSTANTS (`isoInPeriod`), never slice or
 * lexically compare ISO strings (an offset-suffixed string sorts wrongly).
 */
export const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Build a VN-calendar month period (0-based month) with UTC ISO bounds and a VN label. */
export function monthPeriod(year: number, month: number): Period {
  const fromMs = Date.UTC(year, month, 1) - VN_UTC_OFFSET_MS;
  const toMs = Date.UTC(year, month + 1, 1) - VN_UTC_OFFSET_MS - 1; // inclusive, last ms
  const start = new Date(Date.UTC(year, month, 1)); // normalise month overflow for the label
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    label: `${String(start.getUTCMonth() + 1).padStart(2, "0")}/${start.getUTCFullYear()}`,
  };
}

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

/** Parse a "YYYY-MM" key; `null` when malformed (never NaN parts). */
export function parseMonthKey(key: string): { year: number; month0: number } | null {
  const match = MONTH_KEY_RE.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month0: month - 1 };
}

/**
 * Build a month period from a "YYYY-MM" key. A malformed key throws a descriptive
 * `RangeError` (never a cryptic "Invalid time value" or a silent NaN period).
 */
export function monthPeriodFromKey(key: string): Period {
  const parsed = parseMonthKey(key);
  if (!parsed) throw new RangeError(`Invalid month key "${key}" (expected YYYY-MM)`);
  return monthPeriod(parsed.year, parsed.month0);
}

export function coverageOf(sources: DataSource[], knownCount: number, unknownCount: number): SourceCoverage {
  return { sources: Array.from(new Set(sources)), knownCount, unknownCount };
}

function isValidDate(date: Date | undefined): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

/**
 * "YYYY-MM" key for a date's VN (UTC+7) calendar month. An invalid `date` falls
 * back to `fallback` (e.g. the injected clock); with no valid fallback it throws a
 * descriptive `RangeError` instead of returning "NaN-NaN".
 */
export function dateToMonthKey(date: Date, fallback?: Date): string {
  const d = isValidDate(date) ? date : isValidDate(fallback) ? fallback : null;
  if (!d) throw new RangeError("dateToMonthKey: invalid date");
  const vn = new Date(d.getTime() + VN_UTC_OFFSET_MS);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Epoch ms of an ISO string, or NaN when unparseable. */
function instantOf(iso: string): number {
  return Date.parse(iso);
}

/**
 * True when the ISO timestamp falls within `period` (inclusive), comparing real
 * INSTANTS — correct for any offset suffix (`Z`, `+07:00`). Unparseable → false.
 */
export function isoInPeriod(iso: string, period: Period): boolean {
  const t = instantOf(iso);
  if (Number.isNaN(t)) return false;
  return t >= instantOf(period.from) && t <= instantOf(period.to);
}

/** Add `delta` months to a "YYYY-MM" key (delta may be negative). Pure key arithmetic. */
export function addMonthsToKey(key: string, delta: number): string {
  const parsed = parseMonthKey(key);
  if (!parsed) throw new RangeError(`Invalid month key "${key}" (expected YYYY-MM)`);
  const d = new Date(Date.UTC(parsed.year, parsed.month0 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
