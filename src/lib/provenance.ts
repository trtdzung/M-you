/**
 * Presentation helpers for combining provenance across several values — used by
 * the cockpit footer, which must show the WORST-CASE source + freshness across
 * all tiles, not just one input's (Red Team H1/F3, invariant #5).
 */

import type { DataSource } from "@/domain/models";

/** Most-trusted → least-trusted. */
const TRUST_ORDER: DataSource[] = ["msb", "self_reported", "estimated", "mock"];

/** The least-trusted source present (worst case), or null if none given. */
export function lowestTrustSource(sources: (DataSource | null | undefined)[]): DataSource | null {
  let worst: DataSource | null = null;
  let worstRank = -1;
  for (const s of sources) {
    if (!s) continue;
    const rank = TRUST_ORDER.indexOf(s);
    if (rank > worstRank) {
      worstRank = rank;
      worst = s;
    }
  }
  return worst;
}

/** The oldest (most stale) ISO timestamp — worst-case freshness — or null. */
export function oldestFreshness(values: (string | null | undefined)[]): string | null {
  let min: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}
