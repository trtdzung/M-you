"use client";

/**
 * The single composition point: provider data + in-session corrections + the
 * deterministic engine, for the selected period. Every screen reads financial
 * numbers from here so calculations never diverge (DRY). Raw provider data is
 * loaded once per persona; derived figures recompute on period/correction change.
 */

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";
import { computeFinancials, type Financials, type RawData } from "@/domain/engine/finance-compose";
import { useProviders } from "@/providers/context";
import { useAssetLiabilities } from "./assets";
import { useCorrections, applyCorrections } from "./corrections";
import { useGoals } from "./goals";
import { useJarConfig } from "./jars";
import { usePeriod } from "./period";

/** Re-exported so existing screens keep importing these from the hook. */
export type { Financials, RawData } from "@/domain/engine/finance-compose";

export interface UseFinancialsResult {
  loading: boolean;
  error: boolean;
  raw: RawData | null;
  /** All transactions with corrections applied (newest first). */
  transactions: Transaction[];
  financials: Financials | null;
}

/**
 * @param monthOverride When set, financials are computed for this "YYYY-MM"
 *   instead of the shared period selection. The Overview cockpit uses this to
 *   stay pinned to the current month (Red Team C2), independent of any month
 *   picked on the other tabs.
 */
export function useFinancials(monthOverride?: string): UseFinancialsResult {
  const providers = useProviders();
  const { corrections } = useCorrections();
  const { config: jarConfig } = useJarConfig();
  const { assets: userAssets, liabilities: userLiabilities } = useAssetLiabilities();
  const { goals: userGoals } = useGoals();
  const { month: selectedMonth } = usePeriod();
  const month = monthOverride ?? selectedMonth;

  const [raw, setRaw] = useState<RawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([
      providers.listTransactions(),
      providers.listAccounts(),
      providers.listAssets(),
      providers.listLiabilities(),
      providers.getBudgets(),
      providers.getMonthlySnapshots(),
      providers.listGoals(),
      providers.listMockProducts(),
    ])
      .then(([transactions, accounts, assets, liabilities, budgets, snapshots, goals, products]) => {
        if (!active) return;
        setRaw({ transactions, accounts, assets, liabilities, budgets, snapshots, goals, products });
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [providers]);

  const transactions = useMemo(
    () => (raw ? applyCorrections(raw.transactions, corrections) : []),
    [raw, corrections],
  );

  // `userAssets`/`userLiabilities` are context state (single source of truth),
  // not part of the one-time `raw` fetch — including them as deps here is what
  // makes a create/edit/delete recompute net worth + debt health live (#2).
  const financials = useMemo<Financials | null>(
    () =>
      raw
        ? computeFinancials(raw, month, {
            transactions,
            jarConfig,
            userAssets,
            userLiabilities,
            userGoals,
          })
        : null,
    [raw, transactions, month, jarConfig, userAssets, userLiabilities, userGoals],
  );

  return { loading, error, raw, transactions, financials };
}
