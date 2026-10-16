/**
 * Runs all detectors over a period's financials and ranks the results by
 * severity (urgent → attention → info). Pure and deterministic.
 */

import type { Financials } from "@/state/useFinancials";
import type { Insight } from "./types";
import { SEVERITY_RANK } from "./types";
import { budgetPressure } from "./detectors/budget-pressure";
import { jarPressure } from "./detectors/jar-pressure";
import { upcomingObligation } from "./detectors/upcoming-obligation";
import { spendingSpike } from "./detectors/spending-spike";
import { incomeChange } from "./detectors/income-change";
import { newRecurring } from "./detectors/new-recurring";

// No cross-detector dedup in v1 (M10/AD2/F3): budget_pressure and jar_pressure
// may both surface; SEVERITY_RANK below orders them.
const DETECTORS = [budgetPressure, jarPressure, upcomingObligation, spendingSpike, incomeChange, newRecurring];

export function runDetectors(f: Financials): Insight[] {
  return DETECTORS.map((d) => d(f))
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
