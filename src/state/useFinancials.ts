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
import { transferNow } from "@/lib/demo-clock";
import { useProviders } from "@/providers/context";
import { useAssetLiabilities } from "./assets";
import { useCategories } from "./categories";
import { useCorrections, applyCorrections, isHidden } from "./corrections";
import { useManualTxns } from "./manual-txns";
import { useGoals } from "./goals";
import { useJarConfig } from "./jars";
import { usePeriod } from "./period";

/** Re-exported so existing screens keep importing these from the hook. */
export type { Financials, RawData } from "@/domain/engine/finance-compose";

export interface UseFinancialsResult {
  loading: boolean;
  error: boolean;
  raw: RawData | null;
  /**
   * The spend-truth view: provider + manual txns, category
   * corrections applied, hidden rows EXCLUDED. This feeds the engine and every
   * aggregate (including jar balance / spendable and the "Chưa phân bổ" pool), so
   * every screen that derives a jar number agrees.
   */
  transactions: Transaction[];
  /**
   * The list view: same, but hidden rows INCLUDED (so they stay visible +
   * searchable, flagged via `useCorrections`). Use for transaction lists.
   */
  allTransactions: Transaction[];
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
  const { manualTxns } = useManualTxns();
  const { config: jarConfig } = useJarConfig();
  // The persona's STORED taxonomy — categories are data (invariant #7), so the
  // engine is told which labels and which `fixed` flags to compose with instead
  // of reading the bundled seed. Required (not `useOptionalCategories`): every
  // screen that shows a number sits inside `CategoryTaxonomyProvider`, and
  // silently composing against an empty taxonomy is exactly the misreport this
  // phase removes.
  const { categories } = useCategories();
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
        // Balances are DB-backed and already reflect confirmed-transfer debits
        // (no client-side overlay to apply anymore).
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

  // List view: provider + manual txns, category overrides applied, hidden kept.
  const allTransactions = useMemo(
    () => (raw ? applyCorrections([...manualTxns, ...raw.transactions], corrections) : []),
    [raw, manualTxns, corrections],
  );

  // Engine view: same array minus rows the user hid from reports (invariant #6 —
  // excluded like reversed/pending, never deleted). Jar deposits/withdrawals are
  // persisted ledger rows on `jarConfig.ledger` (plan 260923), not synthetic txns,
  // so every consumer of jar balance / the "Chưa phân bổ" pool agrees by construction.
  const transactions = useMemo(
    () => allTransactions.filter((t) => !isHidden(corrections, t.id)),
    [allTransactions, corrections],
  );

  // `userAssets`/`userLiabilities` are context state (single source of truth),
  // not part of the one-time `raw` fetch — including them as deps here is what
  // makes a create/edit/delete recompute net worth + debt health live (#2).
  // `now` is the ONE clock (Red Team #1), read INSIDE the memo: every recompute
  // (config/txn change — exactly when a new ledger row appears) sees a `now` no
  // earlier than the `transferNow()` stamp on that row, so it is never hidden.
  const financials = useMemo<Financials | null>(
    () =>
      raw
        ? computeFinancials(raw, month, {
            now: transferNow(),
            transactions,
            jarConfig,
            userAssets,
            userLiabilities,
            userGoals,
            categories,
          })
        : null,
    [raw, transactions, month, jarConfig, userAssets, userLiabilities, userGoals, categories],
  );

  return { loading, error, raw, transactions, allTransactions, financials };
}
