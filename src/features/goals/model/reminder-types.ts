import type { Lever } from "./types";

export type ReminderKind = "milestone" | "nudge" | "levers" | "pause_month" | "missed_repeatedly";
export type ReminderMilestone = 25 | 50 | 75;

/** A proactive note on one goal. At most one is created per goal per week. */
export interface GoalReminder {
  id: string;
  goalId: string;
  kind: ReminderKind;
  createdAt: string;
  /** Set for `milestone`. */
  milestone: ReminderMilestone | null;
  /** Set for `nudge`: one concrete amount to put in this week (VND). */
  amount: number | null;
  /** Set for `levers`: the adjustments the engine offers. */
  levers: Lever[];
}

/** What the engine decides; id/createdAt are added when it is stored. */
export type ReminderDecision = Omit<GoalReminder, "id" | "goalId" | "createdAt">;
