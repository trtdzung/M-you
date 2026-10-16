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
import { useCorrections, applyCorrections } from "./corrections";
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

export function useFinancials(): UseFinancialsResult {
  const providers = useProviders();
  const { corrections } = useCorrections();
  const { config: jarConfig } = useJarConfig();
  const { month } = usePeriod();

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

  const financials = useMemo<Financials | null>(
    () => (raw ? computeFinancials(raw, month, { transactions, jarConfig }) : null),
    [raw, transactions, month, jarConfig],
  );

  return { loading, error, raw, transactions, financials };
}
