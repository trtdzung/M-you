/**
 * Single source of "now" for the prototype. Fixtures are anchored to
 * mid-September 2026, so the whole app (period picker, budget days-left,
 * upcoming obligations) uses this fixed clock for deterministic demos.
 */

export const DEMO_NOW = new Date("2026-09-15T00:00:00.000Z");

const MONTH_COUNT = 6;

export interface MonthOption {
  /** "YYYY-MM". */
  key: string;
  /** VN label, e.g. "Tháng 9/2026". */
  label: string;
}

function keyOf(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

function labelOf(year: number, month0: number): string {
  return `Tháng ${month0 + 1}/${year}`;
}

/** The current demo month key ("YYYY-MM"). */
export function currentMonthKey(): string {
  return keyOf(DEMO_NOW.getUTCFullYear(), DEMO_NOW.getUTCMonth());
}

/** Available months, newest first, matching the fixture span. */
export function availableMonths(): MonthOption[] {
  const out: MonthOption[] = [];
  const y = DEMO_NOW.getUTCFullYear();
  const m = DEMO_NOW.getUTCMonth();
  for (let i = 0; i < MONTH_COUNT; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push({ key: keyOf(d.getUTCFullYear(), d.getUTCMonth()), label: labelOf(d.getUTCFullYear(), d.getUTCMonth()) });
  }
  return out;
}

/** Label for a "YYYY-MM" key. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return labelOf(y, m - 1);
}

/** Previous month key ("YYYY-MM"). */
export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return keyOf(d.getUTCFullYear(), d.getUTCMonth());
}
