/**
 * Financial-health indicators computable from data available today (no Goals /
 * Debt modules yet). Every indicator is DERIVED, so its provenance is forced to
 * `estimated` (invariant #5). Missing inputs stay `null` — never a silent 0
 * (invariant #6). Band thresholds are named constants, never magic numbers
 * buried in JSX (they are data, reused by the UI).
 */

import type { Account } from "@/domain/models";
import type { CashflowResult } from "./cashflow";
import type { NetWorthResult } from "./networth";
import { cashRunwayMonths } from "./projection";

export type HealthBand = "good" | "warn" | "bad";

export interface HealthIndicator {
  /** Numeric value; ratios are in [0,1]. `null` when not computable. */
  value: number | null;
  /** Qualitative band, or null when the value is null. */
  band: HealthBand | null;
  source: "estimated";
  freshness: string | null;
  /** True when unknown inputs mean the value covers only part of the picture. */
  hasUnknown: boolean;
}

export interface FinancialHealth {
  /** Months of liquid cash at the current burn rate. */
  runwayMonths: HealthIndicator;
  /** Monthly cash surplus (cashflow.net). */
  surplus: HealthIndicator;
  /** Share of income spent on essentials (fixed / income), [0,1]. */
  essentialCoverage: HealthIndicator;
  /** Largest single asset's share of total assets, [0,1]. */
  concentration: HealthIndicator;
}

/** Band thresholds — data, not inline magic numbers (Red Team). */
export const HEALTH_BANDS = {
  /** Runway in months: ≥6 healthy, ≥3 caution, else risk. */
  runwayMonths: { good: 6, warn: 3 },
  /** Essential coverage share: ≤0.5 healthy, ≤0.7 caution, else strained. */
  essentialCoverage: { good: 0.5, warn: 0.7 },
  /** Asset concentration share: ≤0.4 diversified, ≤0.6 caution, else concentrated. */
  concentration: { good: 0.4, warn: 0.6 },
} as const;

/** Higher is better: value ≥ good → good, ≥ warn → warn, else bad. */
function bandHigherBetter(value: number, t: { good: number; warn: number }): HealthBand {
  if (value >= t.good) return "good";
  if (value >= t.warn) return "warn";
  return "bad";
}

/** Lower is better: value ≤ good → good, ≤ warn → warn, else bad. */
function bandLowerBetter(value: number, t: { good: number; warn: number }): HealthBand {
  if (value <= t.good) return "good";
  if (value <= t.warn) return "warn";
  return "bad";
}

export function financialHealth(
  cashflow: CashflowResult,
  accounts: Account[],
  networth: NetWorthResult,
): FinancialHealth {
  // Runway — reuse the Phase-01 projection helper (DRY).
  const runway = cashRunwayMonths(accounts, cashflow.expense);
  const runwayMonths: HealthIndicator = {
    value: runway.months,
    band: runway.months === null ? null : bandHigherBetter(runway.months, HEALTH_BANDS.runwayMonths),
    source: "estimated",
    freshness: runway.meta.freshness,
    hasUnknown: false,
  };

  // Surplus — cashflow.net (always present); positive is good.
  const surplus: HealthIndicator = {
    value: cashflow.net,
    band: cashflow.net >= 0 ? "good" : "bad",
    source: "estimated",
    freshness: cashflow.meta.freshness,
    hasUnknown: false,
  };

  // Essential coverage — fixed / income; null when income is 0.
  const ec = cashflow.income > 0 ? cashflow.fixed / cashflow.income : null;
  const essentialCoverage: HealthIndicator = {
    value: ec,
    band: ec === null ? null : bandLowerBetter(ec, HEALTH_BANDS.essentialCoverage),
    source: "estimated",
    freshness: cashflow.meta.freshness,
    hasUnknown: false,
  };

  // Concentration — largest single asset / assetsTotal; null when no assets.
  const assetAmounts = networth.breakdown.filter((b) => b.kind === "asset").map((b) => b.amount);
  const largest = assetAmounts.reduce((m, v) => Math.max(m, v), 0);
  const conc = networth.assetsTotal > 0 ? largest / networth.assetsTotal : null;
  const concentration: HealthIndicator = {
    value: conc,
    band: conc === null ? null : bandLowerBetter(conc, HEALTH_BANDS.concentration),
    source: "estimated",
    freshness: networth.meta.freshness,
    // Red Team M4: un-valued assets are dropped from assetsTotal, so a % here
    // covers only the valued portion — flag it so it isn't read as complete.
    hasUnknown: networth.hasUnknown,
  };

  return { runwayMonths, surplus, essentialCoverage, concentration };
}
