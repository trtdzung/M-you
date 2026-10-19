/**
 * The Wrapped window: the 6 VN months ENDING AT THE LAST COMPLETED MONTH — one
 * rule for every slide, no partial-month handling anywhere.
 */

import { addMonthsToKey, monthPeriodFromKey, type Period } from "@/domain/engine/types";
import { WRAPPED_MONTHS } from "./wrapped-thresholds";

/** Last completed month for a given "current" month key. */
export function wrappedEndMonthKey(currentKey: string): string {
  return addMonthsToKey(currentKey, -1);
}

/** The window's month keys, oldest first. Throws a RangeError on a malformed key. */
export function wrappedMonthKeys(endMonthKey: string): string[] {
  return Array.from({ length: WRAPPED_MONTHS }, (_, i) =>
    addMonthsToKey(endMonthKey, -(WRAPPED_MONTHS - 1 - i)),
  );
}

/** First month's `from` .. last month's `to`, labelled "03/2026 – 08/2026". */
export function wrappedPeriod(monthKeys: string[]): Period {
  const first = monthPeriodFromKey(monthKeys[0]);
  const last = monthPeriodFromKey(monthKeys[monthKeys.length - 1]);
  return { from: first.from, to: last.to, label: `${first.label} – ${last.label}` };
}
