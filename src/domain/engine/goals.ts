/**
 * Goal projection — a deterministic what-if for "if I save X per month, when do I
 * reach this goal?". The engine owns the number; the AI only narrates it. Simple
 * by design (YAGNI): flat contribution, no growth/interest, explicit assumptions.
 * Missing/invalid inputs stay unknown — never a silent 0.
 */

import type { Goal } from "@/domain/models";
import { addMonthsToKey, dateToMonthKey } from "./types";

/** Hard cap so a tiny contribution can't produce a pathological series. */
const MAX_MONTHS = 600;

export interface GoalPoint {
  month: string;
  projected: number;
}

export type GoalStatus = "already_met" | "achievable" | "unreachable" | "unknown";

export interface GoalProjection {
  goalId: string;
  goalName: string;
  status: GoalStatus;
  currentAmount: number;
  targetAmount: number;
  monthlyContribution: number | null;
  monthsToTarget: number | null;
  targetDate: string | null;
  series: GoalPoint[];
  assumptions: string[];
}

export interface GoalSimInput {
  monthlyContribution?: number | null;
  asOf?: Date;
}

export function simulateGoal(goal: Goal, input: GoalSimInput = {}): GoalProjection {
  const asOf = input.asOf ?? new Date();
  const startKey = dateToMonthKey(asOf);
  const contribution = input.monthlyContribution ?? null;
  const base = {
    goalId: goal.id,
    goalName: goal.name,
    currentAmount: goal.currentAmount,
    targetAmount: goal.targetAmount,
    monthlyContribution: contribution,
    assumptions: [
      "Giả định đóng góp đều mỗi tháng.",
      "Không tính lãi suất hay tăng trưởng đầu tư.",
    ],
  };

  if (goal.currentAmount >= goal.targetAmount) {
    return {
      ...base,
      status: "already_met",
      monthsToTarget: 0,
      targetDate: startKey,
      series: [{ month: startKey, projected: goal.currentAmount }],
    };
  }

  // No usable contribution → we cannot project a date. Do not assume 0.
  if (contribution === null || contribution <= 0) {
    return { ...base, status: "unknown", monthsToTarget: null, targetDate: null, series: [] };
  }

  const remaining = goal.targetAmount - goal.currentAmount;
  const monthsToTarget = Math.ceil(remaining / contribution);
  const points = Math.min(monthsToTarget, MAX_MONTHS);

  const series: GoalPoint[] = [{ month: startKey, projected: goal.currentAmount }];
  for (let i = 1; i <= points; i++) {
    const projected = Math.min(goal.currentAmount + contribution * i, goal.targetAmount);
    series.push({ month: addMonthsToKey(startKey, i), projected });
  }

  return {
    ...base,
    status: monthsToTarget > MAX_MONTHS ? "unreachable" : "achievable",
    monthsToTarget,
    targetDate: monthsToTarget > MAX_MONTHS ? null : addMonthsToKey(startKey, monthsToTarget),
    series,
  };
}
