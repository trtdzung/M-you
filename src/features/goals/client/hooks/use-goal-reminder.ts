"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersonaCif } from "@/providers/context";
import type { GoalReminder } from "../../model/reminder-types";
import { dismissGoalReminder, fetchGoalReminder } from "../goals-api";

/** The proactive note for a goal (at most one a week; the server decides). Failure just means no note. */
export function useGoalReminder(goalId: string | null, refreshKey: unknown = null) {
  const cif = usePersonaCif();
  const [state, setState] = useState<{ key: string; reminder: GoalReminder | null } | null>(null);
  const key = cif && goalId ? `${cif}|${goalId}|${String(refreshKey)}` : null;

  useEffect(() => {
    if (!cif || !goalId || !key) return;
    let live = true;
    void fetchGoalReminder(cif, goalId).then((res) => {
      if (live) setState({ key, reminder: res.ok ? res.data.reminder : null });
    });
    return () => {
      live = false;
    };
  }, [cif, goalId, key]);

  const dismiss = useCallback(async () => {
    const current = state?.reminder;
    if (!cif || !goalId || !current) return;
    setState((s) => (s ? { ...s, reminder: null } : s));
    await dismissGoalReminder(cif, goalId, current.id);
  }, [cif, goalId, state?.reminder]);

  return { reminder: key && state?.key === key ? state.reminder : null, dismiss };
}
