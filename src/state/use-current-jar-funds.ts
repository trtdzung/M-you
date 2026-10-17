"use client";

/**
 * Current-month jar money for the settings screens (Cài đặt → Hũ & danh mục):
 * each jar's running SỐ DƯ and the "Chờ phân bổ" pool (`CASA − Σ spendable`).
 * Both come from the SAME `useFinancials` composition the overview card, the
 * allocation sheet and the transfer picker read, pinned to the current month —
 * the pool is a current stock, so deposits/withdrawals only make sense now (D26,
 * Red Team #2). Nothing is computed here; the engine owns every number (#1).
 */

import { useMemo } from "react";
import type { Amount } from "@/domain/engine/types";
import { currentMonthKey } from "@/lib/demo-clock";
import { useFinancials } from "./useFinancials";

export interface CurrentJarFunds {
  /** `loading` until provider data + the engine are ready; `error` when the load failed. */
  status: "loading" | "error" | "ready";
  /** "Chờ phân bổ" right now; `"unknown"` without a CASA account or while not ready. May be < 0. */
  pool: Amount;
  /** The jar's running balance; `null` = chưa có số dư (unfunded) or not ready. May be < 0. */
  balanceOf: (jarId: string) => number | null;
}

/** What a deposit may take from the pool: `max(0, pool)`, or `null` when the pool is unknown. */
export function allocatableFromPool(pool: Amount): number | null {
  return pool === "unknown" ? null : Math.max(0, pool);
}

export function useCurrentJarFunds(): CurrentJarFunds {
  const { loading, error, financials } = useFinancials(currentMonthKey());
  return useMemo<CurrentJarFunds>(() => {
    if (error) return { status: "error", pool: "unknown", balanceOf: () => null };
    if (loading || !financials) return { status: "loading", pool: "unknown", balanceOf: () => null };
    const balances = new Map(financials.jarEnvelope.jars.map((l) => [l.jarId, l.balance]));
    return {
      status: "ready",
      pool: financials.unallocatedPool.amount,
      balanceOf: (jarId) => balances.get(jarId) ?? null,
    };
  }, [loading, error, financials]);
}
