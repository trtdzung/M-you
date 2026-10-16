/**
 * Narration helpers. Detectors build insights via these so numbers in the
 * explanation always come from a sourceFact value (grounding). `numbersIn` +
 * `factValues` power the grounding guard used in tests.
 */

import type { Insight, InsightFact, InsightSeverity } from "@/domain/models";
import { DEMO_NOW, monthKeyLabel, prevMonthKey } from "@/lib/demo-clock";
import { formatVnd } from "@/lib/format";

/** Label of the month before the given "YYYY-MM" key (comparison period). */
export function prevLabel(monthKey: string): string {
  return monthKeyLabel(prevMonthKey(monthKey));
}

export function fact(label: string, value: number | string, extra?: Partial<InsightFact>): InsightFact {
  return { label, value, ...extra };
}

/** Percentage change prev → cur, rounded. */
export function pctChange(cur: number, prev: number): number {
  if (prev === 0) return 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

export interface BuildInsightInput {
  id: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  explanation: string;
  facts: InsightFact[];
  comparisonPeriod?: string;
  confidence?: number;
  assumptions?: string[];
  actionType?: string;
}

export function buildInsight(input: BuildInsightInput): Insight {
  return {
    id: input.id,
    type: input.type,
    severity: input.severity,
    title: input.title,
    explanation: input.explanation,
    sourceFacts: input.facts,
    comparisonPeriod: input.comparisonPeriod,
    generatedAt: DEMO_NOW.toISOString(),
    confidence: input.confidence ?? 0.9,
    assumptions: input.assumptions ?? [],
    actionType: input.actionType,
    status: "new",
  };
}

/** Format VND for narrative (kept identical to display formatting). */
export const money = formatVnd;

/** Extract the integer values embedded in a VN-formatted string (for grounding). */
export function numbersIn(text: string): number[] {
  const matches = text.match(/\d[\d.]*/g) ?? [];
  return matches.map((m) => Number(m.replace(/\./g, ""))).filter((n) => Number.isFinite(n) && n > 0);
}

/** Numeric values referenced by an insight's facts (for grounding). */
export function factValues(insight: Insight): Set<number> {
  const set = new Set<number>();
  for (const f of insight.sourceFacts) {
    if (typeof f.value === "number") set.add(Math.abs(Math.round(f.value)));
  }
  return set;
}
