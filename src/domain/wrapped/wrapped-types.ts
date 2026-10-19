/**
 * PFM Wrapped — the frozen domain contract. A pure, deterministic recap of the 6
 * VN months ending at the last completed month, built from engine inputs only
 * (invariant #1: no number is computed here that the engine does not own).
 *
 * Conventions every consumer relies on:
 *  - `unit: "pct"` values are PERCENT in [0, 100] (never a 0..1 fraction).
 *  - `unit: "score"` values are health-score points in [0, 100].
 *  - A value that cannot be known is the `"unknown"` sentinel, never 0 (#6).
 *  - Every fact carries period / source / freshness (#5).
 *  - Text facts are `sanitizeLabel`-ed and never name a person counterparty.
 */

import type { DataSource, JarConfig, Transaction } from "@/domain/models";
import type { FinancialHealthScoreResult } from "@/domain/models/health-score";
import type { Amount, Period } from "@/domain/engine/types";
import type { WRAPPED_MONTHS } from "./wrapped-thresholds";

/** Frozen in phase 01; the rules that assign one live in phase 02. */
export type ArchetypeId = "steady-planner" | "weekend-explorer" | "balanced";

/** Fixed deck order. */
export const WRAPPED_SLIDE_ORDER = [
  "opening",
  "total-spend",
  "jar-share",
  "top-merchants",
  "habits",
  "recurring",
  "archetype",
  "health",
  "closing",
] as const;

export type WrappedSlideId = (typeof WRAPPED_SLIDE_ORDER)[number];

export type WrappedFactUnit = "vnd" | "count" | "pct" | "score" | "text";

export interface WrappedFact {
  /**
   * Stable id. Singletons are plain (`total-spend`, `fixed-share`); ranked items
   * are `<kind>.<rank>.<field>` with a 1-based rank, e.g. `merchant.1.name`.
   */
  id: string;
  value: Amount | string | number;
  unit: WrappedFactUnit;
  period: Period;
  source: DataSource;
  /** ISO of the most recent underlying record, or null when none. */
  freshness: string | null;
  /** Plain-language caveat the copy layer may show as a footnote. */
  assumption?: string;
}

export interface WrappedSlide {
  id: WrappedSlideId;
  /** `false` slides are dropped from the deck by `buildWrapped`. */
  available: boolean;
  facts: WrappedFact[];
  /** Oldest-first per-month values; a month without expense data is `"unknown"`. */
  series?: (number | "unknown")[];
}

export interface WrappedCoverage {
  /** Months in the window that carry at least one counted expense row. */
  monthsWithData: number;
  monthsTotal: typeof WRAPPED_MONTHS;
  /** Rows contributing a positive amount to spend in the window. */
  countedExpenseCount: number;
  /** Percent [0, 100] of net spend in the un-enriched bucket; unknown when no spend. */
  unclassifiedPct: Amount;
  sufficient: boolean;
  insufficientReason?: "months" | "transactions";
}

export interface WrappedInput {
  /** `useFinancials().transactions`: correction-applied, hidden-excluded. */
  transactions: Transaction[];
  jarConfig: JarConfig;
  /** Stored id -> label map (`useCategories().labels`). */
  categoryLabels: ReadonlyMap<string, string>;
  /** Stored categories flagged `fixed` (same derivation as `finance-compose`). */
  fixedCategoryIds: ReadonlySet<string>;
  /** Ids of txns whose category the USER corrected (`isUserOrigin`). */
  userCorrectedIds: ReadonlySet<string>;
  /** Last completed month, "YYYY-MM": `addMonthsToKey(currentMonthKey(), -1)`. */
  endMonthKey: string;
  /**
   * Engine-computed health score (`composeFinancialHealthScore`), as of today — not
   * a recap of the window. Absent / null / no overall score drops the health slide.
   */
  healthScore?: FinancialHealthScoreResult | null;
}

export interface WrappedDeck {
  period: Period;
  coverage: WrappedCoverage;
  /** Empty when coverage is insufficient. */
  slides: WrappedSlide[];
}

/** Shared by every `facts-*` builder; built once in `build-wrapped`. */
export interface WrappedContext {
  input: WrappedInput;
  /** The 6 month keys, oldest first. */
  monthKeys: string[];
  /** The whole window as one period. */
  period: Period;
  coverage: WrappedCoverage;
}
