import { addMonthsToDate } from "../engine/months";
import { todayVn } from "../model/today";
import type { CoachHorizon } from "./contracts";

/** Agent horizon -> "YYYY-MM-DD" target date by the demo clock; null when it is not after today. */
export function horizonToTargetDate(h: CoachHorizon, now: Date): string | null {
  const today = todayVn(now);
  let date: string;
  if ("months" in h) {
    date = addMonthsToDate(today, h.months);
  } else {
    const [y, m] = h.target_month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    date = `${h.target_month}-${String(last).padStart(2, "0")}`;
  }
  return date > today ? date : null;
}
