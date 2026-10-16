/**
 * Net worth = assets − liabilities. Unknown values (null) stay unknown: they
 * are excluded from the known-portion total and surfaced in `unknownFields`
 * (never silently treated as 0). Coverage is reported in meta.
 */

import type { Asset, DataSource, Liability } from "@/domain/models";
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
