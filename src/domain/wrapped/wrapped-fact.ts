/** Fact construction + lookup helpers shared by the `facts-*` builders and phase 02. */

import { lowestTrust } from "@/domain/engine/provenance";
import type { Period } from "@/domain/engine/types";
import type { DataSource, Transaction } from "@/domain/models";
import type { WrappedFact, WrappedSlide } from "./wrapped-types";

export interface FactProvenance {
  source: DataSource;
  freshness: string | null;
}

/** Least-verified source + most recent instant among the rows a fact is built from (#5). */
export function provenanceOf(rows: Transaction[]): FactProvenance {
  let freshness: string | null = null;
  for (const t of rows) {
    if (freshness === null || Date.parse(t.postedAt) > Date.parse(freshness)) freshness = t.postedAt;
  }
  return { source: lowestTrust(rows.map((t) => t.source)), freshness };
}

export function makeFact(
  id: string,
  value: WrappedFact["value"],
  unit: WrappedFact["unit"],
  period: Period,
  provenance: FactProvenance,
  assumption?: string,
): WrappedFact {
  return {
    id,
    value,
    unit,
    period,
    source: provenance.source,
    freshness: provenance.freshness,
    ...(assumption ? { assumption } : {}),
  };
}

/** Most recent of the ISO instants (nulls ignored), or null when none. */
export function latestOf(isos: (string | null)[]): string | null {
  let latest: string | null = null;
  for (const iso of isos) {
    if (iso !== null && (latest === null || Date.parse(iso) > Date.parse(latest))) latest = iso;
  }
  return latest;
}

/** Percent in [0, 100], or `"unknown"` when the denominator is not positive. */
export function pctOf(part: number, whole: number): number | "unknown" {
  return whole > 0 ? (part / whole) * 100 : "unknown";
}

/** First fact with `id` across the given slides, or undefined. */
export function findFact(slides: WrappedSlide[], id: string): WrappedFact | undefined {
  for (const slide of slides) {
    const hit = slide.facts.find((f) => f.id === id);
    if (hit) return hit;
  }
  return undefined;
}
