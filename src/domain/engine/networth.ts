/**
 * Net worth = assets − liabilities. Unknown values (null) stay unknown: they
 * are excluded from the known-portion total and surfaced in `unknownFields`
 * (never silently treated as 0). Coverage is reported in meta.
 */

import type { Asset, DataSource, Liability, MonthlySnapshot } from "@/domain/models";
import { coverageOf, type AggregateMeta, type Period } from "./types";

export interface NetWorthItem {
  id: string;
  label: string;
  type: string;
  amount: number;
  kind: "asset" | "liability";
  source: DataSource;
}

export interface NetWorthResult {
  /** Known-portion net worth (assets − liabilities of known values). */
  total: number;
  assetsTotal: number;
  liabilitiesTotal: number;
  breakdown: NetWorthItem[];
  /** Names of assets/liabilities whose value is unknown. */
  unknownFields: string[];
  hasUnknown: boolean;
  meta: AggregateMeta;
}

export function calculateNetWorth(
  assets: Asset[],
  liabilities: Liability[],
  asOf?: string,
): NetWorthResult {
  const breakdown: NetWorthItem[] = [];
  const unknownFields: string[] = [];
  const sources: DataSource[] = [];
  let assetsTotal = 0;
  let liabilitiesTotal = 0;
  let latest: string | null = null;

  const track = (updatedAt: string, source: DataSource) => {
    sources.push(source);
    if (!latest || updatedAt > latest) latest = updatedAt;
  };

  for (const a of assets) {
    track(a.lastUpdatedAt, a.source);
    if (a.value === null) {
      unknownFields.push(a.name);
      continue;
    }
    assetsTotal += a.value;
    breakdown.push({ id: a.id, label: a.name, type: a.type, amount: a.value, kind: "asset", source: a.source });
  }

  for (const l of liabilities) {
    track(l.lastUpdatedAt, l.source);
    if (l.outstandingPrincipal === null) {
      unknownFields.push(l.name);
      continue;
    }
    liabilitiesTotal += l.outstandingPrincipal;
    breakdown.push({ id: l.id, label: l.name, type: l.type, amount: l.outstandingPrincipal, kind: "liability", source: l.source });
  }

  const period: Period = { from: asOf ?? latest ?? "", to: asOf ?? latest ?? "", label: "Hiện tại" };
  const meta: AggregateMeta = {
    period,
    sourceCoverage: coverageOf(sources, sources.length - unknownFields.length, unknownFields.length),
    freshness: latest,
  };

  return {
    total: assetsTotal - liabilitiesTotal,
    assetsTotal,
    liabilitiesTotal,
    breakdown,
    unknownFields,
    hasUnknown: unknownFields.length > 0,
    meta,
  };
}

// ---------------------------------------------------------------------------
// Net-worth trend (delta + sparkline series) from monthly snapshots
// ---------------------------------------------------------------------------

/** Provenance for a snapshot-derived trend (Red Team H2). */
export interface NetWorthTrendMeta {
  /** Lowest-trust source across the snapshots feeding the delta/series. */
  source: DataSource | null;
  /** Number of snapshots used. */
  count: number;
  freshness: string | null;
}

export interface NetWorthTrend {
  /** Latest snapshot net worth, or null if there are no snapshots. */
  current: number | null;
  /** Previous snapshot net worth, or null if fewer than 2 snapshots. */
  previous: number | null;
  /** Chronological net-worth values (oldest → newest) for the sparkline. */
  series: number[];
  meta: NetWorthTrendMeta;
}

/** Most-trusted → least-trusted; the trend reports the lowest present. */
const TRUST_ORDER: DataSource[] = ["msb", "self_reported", "estimated", "mock"];

function lowestTrust(sources: DataSource[]): DataSource | null {
  let worst: DataSource | null = null;
  let worstRank = -1;
  for (const s of sources) {
    const rank = TRUST_ORDER.indexOf(s);
    if (rank > worstRank) {
      worstRank = rank;
      worst = s;
    }
  }
  return worst;
}

/**
 * Derive delta inputs + sparkline series from monthly snapshots. Red Team C3:
 * exposes raw `current`/`previous` for the existing `DeltaBadge` — never a
 * reinvented delta object. Snapshots are sorted by month first (order is not
 * guaranteed); the last `maxPoints` feed the series and carry their own
 * lowest-trust provenance (Red Team H2), separate from current-completeness.
 */
export function networthTrend(
  snapshots: MonthlySnapshot[],
  maxPoints = 6,
): NetWorthTrend {
  const sorted = [...snapshots].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const used = sorted.slice(-maxPoints);
  const series = used.map((s) => s.netWorth);
  const current = sorted.length > 0 ? sorted[sorted.length - 1].netWorth : null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2].netWorth : null;

  return {
    current,
    previous,
    series,
    meta: {
      source: lowestTrust(used.map((s) => s.source)),
      count: used.length,
      // Snapshots carry month granularity only; expose as a full ISO timestamp
      // (start of the latest snapshot month) to match the freshness contract
      // used everywhere else (AggregateMeta/ProjectionMeta).
      freshness: used.length > 0 ? monthKeyToIso(used[used.length - 1].month) : null,
    },
  };
}

/** "YYYY-MM" → ISO timestamp at the start of that UTC month. */
function monthKeyToIso(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toISOString();
}
