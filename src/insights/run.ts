/**
 * Runs all detectors over a period's financials and ranks the results by
 * severity (urgent → attention → info). Pure and deterministic.
 */

import type { Financials } from "@/state/useFinancials";
import type { Insight } from "./types";
import { SEVERITY_RANK } from "./types";
import { budgetPressure } from "./detectors/budget-pressure";
import { upcomingObligation } from "./detectors/upcoming-obligation";
import { spendingSpike } from "./detectors/spending-spike";
import { incomeChange } from "./detectors/income-change";
import { newRecurring } from "./detectors/new-recurring";

const DETECTORS = [budgetPressure, upcomingObligation, spendingSpike, incomeChange, newRecurring];

export function runDetectors(f: Financials): Insight[] {
  return DETECTORS.map((d) => d(f))
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
