"use client";

/**
 * User-authored goals state. Mirrors `state/assets.tsx` exactly: loads the
 * persona's records via the provider seam (persistence only) on mount and on
 * persona switch, exposes create/update/delete, and is threaded into
 * `computeFinancials` as context state — the SINGLE source of truth for user
 * goals (never re-read through the stale one-time `raw` fetch, red-team #2).
 * Every mutation replaces the array reference so `useFinancials`'s `useMemo`
 * recomputes the merged goal view live.
 *
 * Invariants: goals are `self_reported` (#5); a missing amount stays unknown,
 * never 0 (#6). On load the per-record guard (in the provider) drops only
 * malformed elements and reports the count (drop-notice, red-team #4). On
 * persona switch the array resets synchronously BEFORE the async load resolves,
 * so a switched-to persona never flashes the previous persona's goals (H5, #7).
 * No what-if here ever mutates a goal or moves money (#2/#3).
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { GoalFields, GoalRecord } from "@/domain/models/goal-input";
import { useProviders } from "@/providers/context";

/** A unique id for a fresh user goal (stable across the record's lifetime). */
function genId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `goal_${rnd}`;
}

function goalFromFields(fields: GoalFields, currentAmount: number): GoalRecord {
  return {
    id: genId(),
    name: fields.name,
    targetAmount: fields.targetAmount,
    currentAmount,
    targetDate: fields.targetDate,
    source: "self_reported", // manual entry — never presented as bank-verified (#5)
    monthlyContribution: fields.monthlyContribution,
  };
}

interface GoalContextValue {
  goals: GoalRecord[];
  /** Records dropped by the per-record guard on the last load (drop-notice). */
  dropped: number;
  createGoal: (fields: GoalFields) => void;
  updateGoal: (id: string, fields: GoalFields) => void;
  deleteGoal: (id: string) => void;
  dismissDropNotice: () => void;
}

const GoalContext = createContext<GoalContextValue | null>(null);

export function GoalProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [dropped, setDropped] = useState(0);

  // Load on mount + persona switch (providers identity changes per persona).
  useEffect(() => {
    let active = true;
    // H5: reset synchronously first, so a switched-to persona never shows the
    // previous persona's goals for the tick before its load resolves (#7).
    setGoals([]);
    setDropped(0);
    providers
      .getUserGoals()
      .then((g) => {
        if (!active) return;
        setGoals(g.records);
        setDropped(g.dropped);
      })
      .catch(() => {
        if (!active) return;
        setGoals([]);
      });
    return () => {
      active = false;
    };
  }, [providers]);

  const value = useMemo<GoalContextValue>(
    () => ({
      goals,
      dropped,
      createGoal: (fields) => {
        const record = goalFromFields(fields, 0);
        setGoals((prev) => [...prev, record]);
        providers.createGoal(record).catch(() => {});
      },
      updateGoal: (id, fields) => {
        // Guard + persist OUTSIDE the updater so the side effect fires exactly
        // once per call, never twice under StrictMode double-invocation.
        const existing = goals.find((g) => g.id === id);
        if (!existing) return;
        // Preserve the accumulated amount across an edit (the form edits plan
        // fields only, not what's already saved).
        const record: GoalRecord = { ...goalFromFields(fields, existing.currentAmount), id };
        setGoals((prev) => prev.map((g) => (g.id === id ? record : g)));
        providers.updateGoal(record).catch(() => {});
      },
      deleteGoal: (id) => {
        setGoals((prev) => prev.filter((g) => g.id !== id));
        providers.deleteGoal(id).catch(() => {});
      },
      dismissDropNotice: () => setDropped(0),
    }),
    [goals, dropped, providers],
  );

  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
}

export function useGoals(): GoalContextValue {
  const ctx = useContext(GoalContext);
  if (!ctx) throw new Error("useGoals must be used within <GoalProvider>");
  return ctx;
}
