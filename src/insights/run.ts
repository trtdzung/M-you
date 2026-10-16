/**
 * Runs all detectors over a period's financials and ranks the results by
 * severity (urgent → attention → info). Pure and deterministic.
 */

import type { Financials } from "@/state/useFinancials";
import type { Insight } from "./types";
import { SEVERITY_RANK } from "./types";
import { jarPressure } from "./detectors/jar-pressure";
import { upcomingObligation } from "./detectors/upcoming-obligation";
import { spendingSpike } from "./detectors/spending-spike";
import { incomeChange } from "./detectors/income-change";
import { newRecurring } from "./detectors/new-recurring";

// Per-hũ `jarPressure` is the sole budget warning (phase 08 retired the per-
// category `budgetPressure` so the two never double-warn — H3). SEVERITY_RANK
// orders the remaining detectors.
const DETECTORS = [jarPressure, upcomingObligation, spendingSpike, incomeChange, newRecurring];

export function runDetectors(f: Financials): Insight[] {
  return DETECTORS.map((d) => d(f))
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
