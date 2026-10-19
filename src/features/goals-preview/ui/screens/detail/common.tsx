"use client";

import { useMemo } from "react";
import { feasibility, goalValue, progressPct, progressState, requiredMonthly } from "../../../engine";
import type { PreviewState } from "../../../model/state";
import type { Goal, GoalAccount } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { selectAccount, selectGoal } from "../../../store/selectors";
import { EmptyState } from "../../shared/EmptyState";
import { ScreenHeader } from "../../shared/ScreenHeader";

export interface GoalContext {
  state: PreviewState;
  goal: Goal;
  account: GoalAccount | undefined;
  value: ReturnType<typeof goalValue>;
  pct: number;
  progress: ReturnType<typeof progressState>;
  required: number;
  fe: ReturnType<typeof feasibility>;
}

/** Looks up a goal and derives the numbers every goal screen needs. */
export function useGoalContext(goalId: string | undefined): GoalContext | undefined {
  const { state } = usePreview();
  return useMemo(() => {
    const goal = selectGoal(state, goalId);
    if (!goal) return undefined;
    return {
      state,
      goal,
      account: selectAccount(state, goal),
      value: goalValue(state, goal),
      pct: progressPct(state, goal),
      progress: progressState(state, goal),
      required: requiredMonthly(state, goal),
      fe: feasibility(state, goal),
    };
  }, [state, goalId]);
}

export function GoalNotFound({ title }: { title: string }) {
  const { nav } = usePreview();
  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title={title} />
      <EmptyState
        title="Không tìm thấy mục tiêu"
        description="Mục tiêu này không còn tồn tại trong dữ liệu mô phỏng."
        ctaLabel="Về danh sách mục tiêu"
        onCta={() => nav.push("GoalList")}
      />
    </div>
  );
}

/** Whole days since `from` — used for the "cần định giá lại" hint (> 6 months). */
export function isStaleValuation(valuationDate: string, today: string): boolean {
  const days = Math.round((Date.parse(today) - Date.parse(valuationDate)) / 86_400_000);
  return days > 183;
}

/** Statuses that can still receive money. */
export function canTransact(goal: Goal): boolean {
  return goal.status !== "draft" && goal.status !== "closed" && goal.status !== "completed";
}
