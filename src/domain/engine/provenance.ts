/**
 * Shared provenance helpers (invariant #5). A "lowest-trust" fold reports the
 * least-verified source among a set of records, so an aggregate can never look
 * more trustworthy than its weakest input. Extracted from `jar-budget.ts` so the
 * jar-budget and jar-envelope engines share ONE ranking (DRY).
 */

import type { DataSource } from "@/domain/models";

/** Trust ranking — a lower rank is less verified, so it wins a "lowest-trust" fold. */
export const TRUST_RANK: Record<DataSource, number> = {
  estimated: 0,
  mock: 1,
  self_reported: 2,
  msb: 3,
};

/** Lowest-trust source among a list, or "mock" (prototype baseline) when empty. */
export function lowestTrust(sources: DataSource[]): DataSource {
  if (sources.length === 0) return "mock";
  return sources.reduce((lo, s) => (TRUST_RANK[s] < TRUST_RANK[lo] ? s : lo), sources[0]);
}
