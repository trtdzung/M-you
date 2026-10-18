import type { GoalProgress } from "../model/types";

export interface ProgressInput {
  targetAmount: number;
  currentAmount: number;
  /** ISO timestamp the goal was created. */
  createdAt: string;
  /** "YYYY-MM-DD". */
  targetDate: string;
  now: Date;
}

const MILESTONES = [25, 50, 75, 100] as const;
const BEHIND_RATIO = 0.1;
const AHEAD_RATIO = 1.1;

/** Linear plan from `createdAt` to `targetDate`: how much should be saved by `now`. */
function expectedAmount({ targetAmount, createdAt, targetDate, now }: ProgressInput): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(`${targetDate}T00:00:00.000Z`).getTime();
  if (!(end > start)) return targetAmount;
  const elapsed = (now.getTime() - start) / (end - start);
  return Math.round(targetAmount * Math.min(1, Math.max(0, elapsed)));
}

export function assessProgress(input: ProgressInput): GoalProgress {
  const { targetAmount, currentAmount } = input;
  const expected = expectedAmount(input);
  const percent = Math.min(100, Math.round((currentAmount / targetAmount) * 1000) / 10);
  const reached = MILESTONES.filter((m) => percent >= m);
  const milestone = (reached.length > 0 ? reached[reached.length - 1] : 0) as GoalProgress["milestone"];

  if (currentAmount >= targetAmount) {
    return { percent: 100, milestone: 100, state: "on_track", expectedAmount: expected };
  }
  const gap = expected - currentAmount;
  let state: GoalProgress["state"];
  if (gap <= 0) state = currentAmount > expected * AHEAD_RATIO ? "ahead" : "on_track";
  else if (gap <= targetAmount * BEHIND_RATIO) state = "slightly_behind";
  else state = "off_track";
  return { percent, milestone, state, expectedAmount: expected };
}
