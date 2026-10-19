import type { WorldState } from "../model/state";
import type { Goal, GoalPhase, GoalStatus, ISODate, Loan } from "../model/types";
import { daysBetween, formatISODate } from "./dates";
import { goalValue } from "./value";

export function phaseOf(goal: Goal): GoalPhase {
  return goal.status === "achieved" || goal.status === "repaying" ? 2 : 1;
}

/** Statuses shown in the "Lịch sử" tab rather than the active list. */
export function isHistory(status: GoalStatus): boolean {
  return status === "completed" || status === "closed";
}

export type DueOutcome = "enough" | "short";

export function dueOutcome(world: Pick<WorldState, "accounts" | "assets" | "clock" | "market">, goal: Goal): DueOutcome {
  return goalValue(world, goal).total >= goal.targetAmount ? "enough" : "short";
}

export interface LifecycleEvent {
  goalId: string;
  kind: "early_achieved" | "completed" | "missed" | "loan_paid_off";
  message: string;
}

/**
 * Applies automatic transitions on `draft` for date `today` (mutates):
 * - accumulating, reached target before date → mark reachedEarlyAt (customer decides to complete early)
 * - accumulating, date reached, enough → completed
 * - accumulating, date reached, short → missed (customer: extend / reduce / borrow / close)
 * - repaying, loan paid off → completed
 */
export function applyLifecycle(draft: WorldState, today: ISODate): LifecycleEvent[] {
  const events: LifecycleEvent[] = [];
  for (const goal of draft.goals) {
    if (goal.status === "accumulating") {
      const value = goalValue(draft, goal).total;
      if (today >= goal.targetDate) {
        if (value >= goal.targetAmount) {
          goal.status = "completed";
          goal.completedAt = today;
          goal.finalValue = value;
          events.push({ goalId: goal.id, kind: "completed", message: `“${goal.name}” đã đến hạn và đủ tiền — Hoàn thành!` });
        } else {
          goal.status = "missed";
          events.push({ goalId: goal.id, kind: "missed", message: `“${goal.name}” đến hạn nhưng chưa đủ tiền.` });
        }
      } else if (value >= goal.targetAmount && !goal.reachedEarlyAt) {
        goal.reachedEarlyAt = today;
        events.push({
          goalId: goal.id,
          kind: "early_achieved",
          message: `“${goal.name}” đã đủ tiền trước hạn ${formatISODate(goal.targetDate)}.`,
        });
      }
    } else if (goal.status === "repaying" || goal.status === "achieved") {
      const loan = goal.loanId ? draft.loans.find((l) => l.id === goal.loanId) : undefined;
      if (loan && loan.status === "paid_off" && goal.status === "repaying") {
        goal.status = "completed";
        goal.completedAt = today;
        goal.finalValue = goal.targetAmount;
        events.push({ goalId: goal.id, kind: "loan_paid_off", message: `“${goal.name}” đã trả hết nợ — Hoàn thành!` });
      }
    }
  }
  return events;
}

/** Marks the next unpaid row "due" when within 10 days; keeps overdue rows. Mutates. */
export function refreshLoanStatuses(loan: Loan, today: ISODate): void {
  let nextMarked = false;
  for (const row of loan.schedule) {
    if (row.status === "paid" || row.status === "overdue") continue;
    if (!nextMarked) {
      row.status = daysBetween(today, row.dueDate) <= 10 ? "due" : "upcoming";
      nextMarked = true;
    } else {
      row.status = "upcoming";
    }
  }
  if (loan.schedule.every((r) => r.status === "paid")) loan.status = "paid_off";
}

/** Days left until the target date (negative when past). */
export function daysToTarget(goal: Goal, today: ISODate): number {
  return daysBetween(today, goal.targetDate);
}
