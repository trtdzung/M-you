import type { Lever } from "../../model/types";
import { addMonthsToDate } from "../months";

/** Keep the amount, push the date out until the surplus alone covers the gap. */
export function extendDateLever(
  targetAmount: number,
  currentAmount: number,
  surplus: number,
  now: Date,
): Extract<Lever, { kind: "extend_date" }> {
  const months = Math.ceil((targetAmount - currentAmount) / surplus);
  const today = now.toISOString().slice(0, 10);
  return { kind: "extend_date", newDate: addMonthsToDate(today, months), months };
}
