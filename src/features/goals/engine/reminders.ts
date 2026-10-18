import { addMonthsToKey, dateToMonthKey } from "@/domain/engine/types";
import type { GoalLedgerEntry, Lever, SavingsGoalView } from "../model/types";
import type { ReminderDecision, ReminderMilestone } from "../model/reminder-types";

const MISSED_MONTHS = 3;
const NUDGE_ROUND = 100_000;
const MILESTONES: readonly ReminderMilestone[] = [25, 50, 75];

export interface ReminderInput {
  goal: SavingsGoalView;
  ledger: GoalLedgerEntry[];
  /** Levers the engine offers for this goal (from `buildLevers`). */
  levers: Lever[];
  /** Income dropped, an unusual spend or a month-end shortfall is active (from the advisor signals). */
  pauseSignal: boolean;
  /** Milestones already celebrated. */
  notifiedMilestones: readonly number[];
  now: Date;
}

/** True when the goal is old enough and had no deposit in each of the last `MISSED_MONTHS` complete months. */
function missedRepeatedly({ goal, ledger, now }: ReminderInput): boolean {
  const current = dateToMonthKey(now);
  const windowStart = addMonthsToKey(current, -MISSED_MONTHS);
  if (dateToMonthKey(new Date(goal.createdAt)) > windowStart) return false;
  const depositMonths = new Set(ledger.filter((e) => e.kind === "deposit").map((e) => dateToMonthKey(new Date(e.createdAt))));
  for (let back = 1; back <= MISSED_MONTHS; back++) {
    if (depositMonths.has(addMonthsToKey(current, -back))) return false;
  }
  return true;
}

/**
 * Which note (if any) fits this goal now. On track -> silence except a new milestone; slightly behind ->
 * one concrete amount; clearly behind -> the engine's levers; a money shock -> offer a one-month pause;
 * repeated misses -> ask keep / adjust / archive. First match wins, in that priority.
 */
export function decideReminder(input: ReminderInput): ReminderDecision | null {
  const { goal } = input;
  if (goal.status !== "active" || goal.currentAmount >= goal.targetAmount) return null;
  const state = goal.progress.state;
  const none = { milestone: null, amount: null, levers: [] };

  if (missedRepeatedly(input)) return { ...none, kind: "missed_repeatedly" };
  if (input.pauseSignal && (state === "slightly_behind" || state === "off_track")) return { ...none, kind: "pause_month" };
  if (state === "off_track" && input.levers.length > 0) return { ...none, kind: "levers", levers: input.levers };
  if (state === "slightly_behind" || state === "off_track") {  // off track without levers: still one concrete step
    const gap = Math.max(0, goal.progress.expectedAmount - goal.currentAmount);
    const raw = Math.min(gap, goal.feasibility.requiredMonthly);
    return { ...none, kind: "nudge", amount: Math.max(NUDGE_ROUND, Math.ceil(raw / NUDGE_ROUND) * NUDGE_ROUND) };
  }
  if (state === "on_track" || state === "ahead") {
    const highest = Math.max(0, ...input.notifiedMilestones);
    const reached = MILESTONES.filter((m) => goal.progress.milestone >= m && m > highest);
    if (reached.length > 0) return { ...none, kind: "milestone", milestone: reached[reached.length - 1] };
  }
  return null;
}
