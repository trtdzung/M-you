/**
 * Insight types for the rule-based engine. The canonical Insight shape lives in
 * domain/models; detectors are pure functions over engine outputs (Financials).
 * Narrative is templated Vietnamese — but every number must trace to a sourceFact.
 */

import type { Insight, InsightFact, InsightSeverity } from "@/domain/models";
import type { Financials } from "@/state/useFinancials";

export type { Insight, InsightFact, InsightSeverity };

/** A detector inspects the period's financials and optionally emits one insight. */
export type Detector = (f: Financials) => Insight | null;

/**
 * A per-jar detector emits an array (or `null` when nothing fires) — e.g.
 * `jar-overspend-covered`, which reports one insight per covered/unfunded jar.
 * `run.ts` flattens either shape into the ranked list.
 */
export type MultiDetector = (f: Financials) => Insight[] | null;

export const SEVERITY_RANK: Record<InsightSeverity, number> = {
  urgent: 0,
  attention: 1,
  info: 2,
};
