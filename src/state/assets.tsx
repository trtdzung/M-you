"use client";

/**
 * User-authored assets & liabilities state. Loads the persona's records via the
 * provider seam (persistence only) on mount and on persona switch, exposes
 * create/update/delete, and is threaded into `computeFinancials` as context state
 * — the SINGLE source of truth for user records (never re-read through the stale
 * one-time `raw` fetch, red-team #2). Every mutation replaces the array reference
 * so `useFinancials`'s `useMemo` recomputes net worth + debt health live.
 *
 * Invariants: manual values are `self_reported` with `lastSyncedAt` = edit time
 * (#5); a missing valuation stays `null` (unknown, never 0 — #6). On load the
 * per-record guard (in the provider) drops only malformed elements and reports
 * the count so a corrupt record never wipes the rest (red-team #4). On persona
 * switch the arrays reset synchronously BEFORE the async load resolves, so a
 * switched-to persona never flashes the previous persona's records (H5, #7).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Asset, Liability } from "@/domain/models";
import type {
  AssetFields,
  LiabilityFields,
} from "@/domain/models/asset-liability-input";
import { useProviders } from "@/providers/context";

/** A unique id for a fresh user record (stable across the record's lifetime). */
function genId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rnd}`;
}

function assetFromFields(fields: AssetFields, editedAt: string): Asset {
  return {
    id: genId("asset"),
    type: fields.type,
    name: fields.name,
    value: fields.value,
    currency: "VND",
    source: "self_reported", // manual entry — never presented as bank-verified (#5)
    lastUpdatedAt: editedAt,
    isEstimated: fields.value !== null, // a provided manual figure is an estimate
  };
}

function liabilityFromFields(fields: LiabilityFields, editedAt: string): Liability {
  return {
    id: genId("liab"),
    type: fields.type,
    name: fields.name,
    outstandingPrincipal: fields.outstandingPrincipal,
    interestRate: fields.interestRate,
    minimumPayment: fields.minimumPayment,
    dueDate: fields.dueDate,
    remainingTerm: fields.remainingTerm,
    source: "self_reported",
    lastUpdatedAt: editedAt,
  };
}

interface AssetLiabilityContextValue {
  assets: Asset[];
  liabilities: Liability[];
  /** Records dropped by the per-record guard on the last load (drop-notice). */
  dropped: number;
  createAsset: (fields: AssetFields) => void;
  updateAsset: (id: string, fields: AssetFields) => void;
  deleteAsset: (id: string) => void;
  createLiability: (fields: LiabilityFields) => void;
  updateLiability: (id: string, fields: LiabilityFields) => void;
  deleteLiability: (id: string) => void;
  dismissDropNotice: () => void;
}

const AssetLiabilityContext = createContext<AssetLiabilityContextValue | null>(null);

export function AssetLiabilityProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [dropped, setDropped] = useState(0);

  // Load on mount + persona switch (providers identity changes per persona).
  useEffect(() => {
    let active = true;
    // H5: reset to the empty seed synchronously first, so a switched-to persona
    // never shows the previous persona's records for the tick before its load
    // resolves, and no in-flight write lands under the wrong persona key (#7).
    setAssets([]);
    setLiabilities([]);
    setDropped(0);
    Promise.all([providers.getUserAssets(), providers.getUserLiabilities()])
      .then(([a, l]) => {
        if (!active) return;
        setAssets(a.records);
        setLiabilities(l.records);
        setDropped(a.dropped + l.dropped);
      })
      .catch(() => {
        if (!active) return;
        setAssets([]);
        setLiabilities([]);
      });
    return () => {
      active = false;
    };
  }, [providers]);

  const value = useMemo<AssetLiabilityContextValue>(() => {
    const now = () => new Date().toISOString();
    return {
      assets,
      liabilities,
      dropped,
      createAsset: (fields) => {
        const record = assetFromFields(fields, now());
        setAssets((prev) => [...prev, record]);
        providers.createAsset(record).catch(() => {});
      },
      updateAsset: (id, fields) => {
        // Guard + persist OUTSIDE the updater so the side effect fires exactly
        // once per call, never twice under StrictMode double-invocation.
        if (!assets.some((a) => a.id === id)) return;
        const record: Asset = { ...assetFromFields(fields, now()), id };
        setAssets((prev) => prev.map((a) => (a.id === id ? record : a)));
        providers.updateAsset(record).catch(() => {});
      },
      deleteAsset: (id) => {
        setAssets((prev) => prev.filter((a) => a.id !== id));
        providers.deleteAsset(id).catch(() => {});
      },
      createLiability: (fields) => {
        const record = liabilityFromFields(fields, now());
        setLiabilities((prev) => [...prev, record]);
        providers.createLiability(record).catch(() => {});
      },
      updateLiability: (id, fields) => {
        if (!liabilities.some((l) => l.id === id)) return;
        const record: Liability = { ...liabilityFromFields(fields, now()), id };
        setLiabilities((prev) => prev.map((l) => (l.id === id ? record : l)));
        providers.updateLiability(record).catch(() => {});
      },
      deleteLiability: (id) => {
        setLiabilities((prev) => prev.filter((l) => l.id !== id));
        providers.deleteLiability(id).catch(() => {});
      },
      dismissDropNotice: () => setDropped(0),
    };
  }, [assets, liabilities, dropped, providers]);

  return (
    <AssetLiabilityContext.Provider value={value}>{children}</AssetLiabilityContext.Provider>
  );
}

export function useAssetLiabilities(): AssetLiabilityContextValue {
  const ctx = useContext(AssetLiabilityContext);
  if (!ctx) throw new Error("useAssetLiabilities must be used within <AssetLiabilityProvider>");
  return ctx;
}
