/**
 * Deterministic archetype from phase-01 facts only (no recomputation, no LLM).
 *
 * Signals are the 4 facts below; the two share signals are the person-excluded
 * variants so a transfer to an individual never decides a personality label.
 * A signal that is `"unknown"` or absent is skipped — never evaluated as 0 (#6).
 * Ordered rules, first match wins; thresholds are named in `wrapped-thresholds`.
 */

import { lowestTrust } from "@/domain/engine/provenance";
import type { Period } from "@/domain/engine/types";
import { latestOf, makeFact } from "./wrapped-fact";
import {
  ARCHETYPE_MIN_SIGNALS,
  STEADY_PLANNER_FIXED_MIN,
  WEEKEND_EXPLORER_MIN,
} from "./wrapped-thresholds";
import type { ArchetypeId, WrappedFact, WrappedSlide } from "./wrapped-types";

export interface ArchetypeResult {
  id: ArchetypeId;
  /** The triggering fact first, then known supporting facts; 2-3 full facts. */
  evidence: WrappedFact[];
}

/** Id of the text fact that carries the assigned archetype on its slide. */
export const ARCHETYPE_FACT_ID = "archetype-id";

const FIXED = "fixed-share-excl-person";
const WEEKEND = "weekend-share-excl-person";
const TOP3 = "top3-share";
const DISTINCT = "distinct-merchants";

/** Display/evidence priority of the signals (balanced uses this order verbatim). */
const SIGNAL_IDS = [FIXED, WEEKEND, TOP3, DISTINCT] as const;
const MAX_EVIDENCE = 3;

const isKnown = (f: WrappedFact | undefined): f is WrappedFact =>
  f !== undefined && typeof f.value === "number" && Number.isFinite(f.value);

function evidenceFor(trigger: string | null, known: Map<string, WrappedFact>): WrappedFact[] {
  const order = trigger === null ? [...SIGNAL_IDS] : [trigger, ...SIGNAL_IDS.filter((id) => id !== trigger)];
  return order
    .map((id) => known.get(id))
    .filter((f): f is WrappedFact => f !== undefined)
    .slice(0, MAX_EVIDENCE);
}

/** `null` when fewer than `ARCHETYPE_MIN_SIGNALS` of the 4 signals are known. */
export function assignArchetype(facts: WrappedFact[]): ArchetypeResult | null {
  const known = new Map<string, WrappedFact>();
  for (const id of SIGNAL_IDS) {
    const fact = facts.find((f) => f.id === id);
    if (isKnown(fact)) known.set(id, fact);
  }
  if (known.size < ARCHETYPE_MIN_SIGNALS) return null;

  const weekend = known.get(WEEKEND);
  if (weekend && (weekend.value as number) >= WEEKEND_EXPLORER_MIN) {
    return { id: "weekend-explorer", evidence: evidenceFor(WEEKEND, known) };
  }
  const fixed = known.get(FIXED);
  if (fixed && (fixed.value as number) >= STEADY_PLANNER_FIXED_MIN) {
    return { id: "steady-planner", evidence: evidenceFor(FIXED, known) };
  }
  return { id: "balanced", evidence: evidenceFor(null, known) };
}

/**
 * The archetype slide. Facts = `archetype-id` (text) + the evidence, so the slide
 * stays self-describing for the copy layer without widening the frozen slide type.
 * `earlier` are the already-built slides the signals live on.
 */
export function archetypeSlide(period: Period, earlier: WrappedSlide[]): WrappedSlide {
  const result = assignArchetype(earlier.flatMap((s) => s.facts));
  if (result === null) return { id: "archetype", available: false, facts: [] };

  const idFact = makeFact(
    ARCHETYPE_FACT_ID,
    result.id,
    "text",
    period,
    {
      source: lowestTrust(result.evidence.map((f) => f.source)),
      freshness: latestOf(result.evidence.map((f) => f.freshness)),
    },
    "Nhãn chỉ mang tính tham khảo, dựa trên thói quen chi tiêu trong giai đoạn này",
  );
  return { id: "archetype", available: true, facts: [idFact, ...result.evidence] };
}
