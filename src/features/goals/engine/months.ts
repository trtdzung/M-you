/** Calendar months from `now`'s month to `targetDate`'s month, at least 1. */
export function monthsLeft(now: Date, targetDate: string): number {
  const [y, m] = targetDate.split("-").map(Number);
  const diff = (y - now.getUTCFullYear()) * 12 + (m - 1 - now.getUTCMonth());
  return Math.max(1, diff);
}

/** "YYYY-MM-DD" + n months; clamps to the last day when the day overflows. */
export function addMonthsToDate(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (v: number, w = 2) => String(v).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}
