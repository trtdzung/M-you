/**
 * Runs all detectors over a period's financials and ranks the results by
 * severity (urgent → attention → info). Pure and deterministic.
 */

import type { Financials } from "@/state/useFinancials";
import type { Detector, Insight, MultiDetector } from "./types";
import { SEVERITY_RANK } from "./types";
import { jarPressure } from "./detectors/jar-pressure";
import { jarOverspendCovered } from "./detectors/jar-overspend-covered";
import { upcomingObligation } from "./detectors/upcoming-obligation";
import { spendingSpike } from "./detectors/spending-spike";
import { newRecurring } from "./detectors/new-recurring";

// Per-hũ `jarPressure` is the sole budget warning (phase 08 retired the per-
// category `budgetPressure` so the two never double-warn — H3). `jarOverspendCovered`
// is complementary, not a budget warning: it reports vượt-hũ that a rebalance already
// covered, plus the C5 "cần bù thủ công" residual (plan 260918-1120). SEVERITY_RANK
// orders the remaining detectors. (income_change was removed with income.)
const DETECTORS: Array<Detector | MultiDetector> = [
  jarPressure,
  jarOverspendCovered,
  upcomingObligation,
  spendingSpike,
  newRecurring,
];

export function runDetectors(f: Financials): Insight[] {
  return DETECTORS.flatMap((d) => {
    const out = d(f);
    return out === null ? [] : Array.isArray(out) ? out : [out];
  }).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
