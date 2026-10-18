import type { Lever } from "../../model/types";

const ROUNDING = 100_000;

/** Keep the date, lower the target to what the surplus can reach (rounded down to 100k). */
export function reduceAmountLever(
  currentAmount: number,
  surplus: number,
  monthsLeft: number,
): Extract<Lever, { kind: "reduce_amount" }> {
  const reachable = currentAmount + surplus * monthsLeft;
  return { kind: "reduce_amount", newTarget: Math.floor(reachable / ROUNDING) * ROUNDING };
}
