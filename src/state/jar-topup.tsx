"use client";

/**
 * Session-only jar top-ups — the "Chia tiền vào hũ" action. Adding money to a jar
 * must raise its SỐ DƯ (balance) WITHOUT raising its HẠN MỨC (`budgetLimit`), the
 * SAME two-axis rule as an inter-jar rebalance (journal 260920): a jar already
 * "đã vượt hạn mức" must keep that verdict after being topped up.
 *
 * We reuse the engine's EXISTING pool→jar rebalance channel (the one auto-fund's
 * pool cover already writes): each top-up is a `REBALANCE_CATEGORY` txn carrying
 * `rebalance: { fromJarId: "pool", toJarId }`. `rebalanceNetByJar` folds `+amount`
 * into that jar's `remaining` and SKIPS the pool end — the derived "Chờ phân bổ"
 * shrinks through the jar's higher spendable, so `pool + Σ spendable = CASA` stays
 * tautological (invariant #1). `budgetLimit`/`spent`/thu/chi are all untouched.
 *
 * TEMPORARY / DISPLAY-ONLY (product call 2026-09-21): these records live in React
 * state ONLY — never persisted to SQLite, never POSTed to any /api route. They are
 * merged into the ENGINE transaction view in `useFinancials`, so every jar-balance
 * surface (overview, Ngân sách tab, pool) reflects them for the CURRENT month.
 * They reset on reload and on persona switch and — like any rebalance — do not
 * carry into next month (`rebalanceNetByJar` is per-period). The stored ledger is
 * never changed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY, REBALANCE_CATEGORY_LABEL } from "@/domain/models";
import { POOL_DONOR_ID } from "@/domain/engine/jar-funding";
import { transferNow } from "@/lib/demo-clock";
import { usePersona } from "@/providers/context";
import { buildManualTxn } from "./manual-txns";

interface JarTopupContextValue {
  /** Synthetic pool→jar rebalance txns added this session (current-month display only). */
  topupTxns: Transaction[];
  /**
   * Top up one or more jars' BALANCE from the "Chờ phân bổ" pool. `patches` maps
   * jarId → amount to ADD; non-positive amounts are ignored. Never touches
   * `budgetLimit`; never persists.
   */
  addTopups: (patches: Record<string, number>) => void;
  /** Drop every session top-up (e.g. a "hoàn tác" affordance). */
  clear: () => void;
}

const JarTopupContext = createContext<JarTopupContextValue | null>(null);

export function JarTopupProvider({ children }: { children: React.ReactNode }) {
  const { persona } = usePersona();
  const [topupTxns, setTopupTxns] = useState<Transaction[]>([]);

  // Session-scoped per persona: a persona switch clears prior top-ups so one
  // persona's display boost never leaks onto another.
  useEffect(() => {
    setTopupTxns([]);
  }, [persona.cif]);

  const addTopups = useCallback((patches: Record<string, number>) => {
    // Date the top-up on the SAME demo clock the whole app is anchored to
    // (`transferNow` → the demo month), so a top-up is in-period for the overview,
    // the transfer source picker and confirm alike — never dependent on the real
    // wall-clock month (`rebalanceNetByJar` filters by period).
    const now = transferNow().toISOString();
    const built: Transaction[] = [];
    for (const [jarId, amount] of Object.entries(patches)) {
      if (!Number.isFinite(amount) || amount <= 0) continue;
      built.push(
        buildManualTxn({
          amount,
          direction: "debit",
          type: "transfer", // excluded from thu/chi; REBALANCE_CATEGORY isn't in the taxonomy
          categoryId: REBALANCE_CATEGORY,
          merchantName: REBALANCE_CATEGORY_LABEL,
          postedAt: now,
          rebalance: {
            fromJarId: POOL_DONOR_ID, // "pool" — the derived pool is never debited as a bucket
            toJarId: jarId,
            triggerTxnId: `topup-${jarId}-${Date.now()}`,
            origin: "manual",
          },
        }),
      );
    }
    if (built.length) setTopupTxns((prev) => [...built, ...prev]);
  }, []);

  const clear = useCallback(() => setTopupTxns([]), []);

  const value = useMemo<JarTopupContextValue>(
    () => ({ topupTxns, addTopups, clear }),
    [topupTxns, addTopups, clear],
  );

  return <JarTopupContext.Provider value={value}>{children}</JarTopupContext.Provider>;
}

export function useJarTopup(): JarTopupContextValue {
  const ctx = useContext(JarTopupContext);
  if (!ctx) throw new Error("useJarTopup must be used within <JarTopupProvider>");
  return ctx;
}
