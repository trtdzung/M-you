"use client";

/**
 * Insight interaction state (dismiss / snooze / helpful), persisted locally, plus
 * two conveniences:
 *  - `useInsightState()` overlays state onto insights you already computed
 *    (use when you already hold `financials`, e.g. Overview — avoids reloading).
 *  - `useInsights()` computes insights for the current period and overlays state.
 * Insights themselves come from the pure detector engine.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { runDetectors } from "@/insights/run";
import type { Insight } from "@/insights/types";
import type { Financials } from "./useFinancials";
import { useFinancials } from "./useFinancials";

type UserStatus = "dismissed" | "snoozed" | "helpful";
const STORAGE_KEY = "msb-pfm.insight-status";

function read(): Record<string, UserStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, UserStatus>) : {};
  } catch {
    return {};
  }
}

export interface InsightState {
  decorate: (insights: Insight[]) => Insight[];
  visibleOf: (insights: Insight[]) => Insight[];
  dismiss: (id: string) => void;
  snooze: (id: string) => void;
  markHelpful: (id: string) => void;
}

export function useInsightState(): InsightState {
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});

  useEffect(() => {
    setStatuses(read());
  }, []);

  const setStatus = useCallback((id: string, status: UserStatus) => {
    setStatuses((prev) => {
      const next = { ...prev, [id]: status };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const decorate = useCallback(
    (insights: Insight[]) => insights.map((i) => (statuses[i.id] ? { ...i, status: statuses[i.id] } : i)),
    [statuses],
  );
  const visibleOf = useCallback(
    (insights: Insight[]) => decorate(insights).filter((i) => i.status !== "dismissed" && i.status !== "snoozed"),
    [decorate],
  );

  return {
    decorate,
    visibleOf,
    dismiss: (id) => setStatus(id, "dismissed"),
    snooze: (id) => setStatus(id, "snoozed"),
    markHelpful: (id) => setStatus(id, "helpful"),
  };
}

/**
 * Convenience: insights for the current period with interaction state applied.
 * `monthOverride` pins the computation to a specific "YYYY-MM" (the Overview
 * cockpit passes the current month — Red Team C2).
 */
export function useInsights(monthOverride?: string) {
  const { financials, loading, error, transactions } = useFinancials(monthOverride);
  const state = useInsightState();

  const base = useMemo<Insight[]>(() => (financials ? runDetectors(financials) : []), [financials]);
  const insights = useMemo(() => state.decorate(base), [state, base]);
  const visible = useMemo(() => state.visibleOf(base), [state, base]);

  return { loading, error, financials, transactions, insights, visible, dismiss: state.dismiss, snooze: state.snooze, markHelpful: state.markHelpful };
}
