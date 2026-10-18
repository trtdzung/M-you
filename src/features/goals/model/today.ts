const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of `now` in Vietnam time (UTC+7), same calendar the cashflow engine uses. */
export function todayVn(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
