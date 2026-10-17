import "server-only";

import type { SavingsGoal } from "../model/types";
import { currentAmount } from "./ledger-repo";

export type GoalWithAmount = SavingsGoal & { currentAmount: number };

/** Goal + its derived current amount (progress/feasibility are added later). */
export function withCurrentAmount(cif: string, goal: SavingsGoal): GoalWithAmount {
  return { ...goal, currentAmount: currentAmount(cif, goal.id) };
}
