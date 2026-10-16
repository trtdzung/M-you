/**
 * Single source of "now" for the prototype. Fixtures are anchored to
 * mid-September 2026, so the whole app (period picker, budget days-left,
 * upcoming obligations) uses this fixed clock for deterministic demos.
 */

import { addMonthsToKey, dateToMonthKey } from "@/domain/engine/types";

export const DEMO_NOW = new Date("2026-09-15T00:00:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The ONE clock the Chuyển tiền flow uses (S10/U7): Compose's funding
 * assessment, Confirm's assessment, and the posted txn's `postedAt` all read
 * this, so they can never land in different months. It is the demo DATE
 * (`DEMO_NOW`'s day) with the real clock's time-of-day, so successive transfers
 * keep a natural order while always posting inside the demo month the rest of
 * the app is anchored to. `realNow` is injectable for tests.
 */
export function transferNow(realNow: Date = new Date()): Date {
  const timeOfDay = ((realNow.getTime() % DAY_MS) + DAY_MS) % DAY_MS;
  return new Date(DEMO_NOW.getTime() + timeOfDay);
}

const MONTH_COUNT = 6;

export interface MonthOption {
  /** "YYYY-MM". */
  key: string;
  /** VN label, e.g. "Tháng 9/2026". */
  label: string;
}

function labelOf(year: number, month0: number): string {
  return `Tháng ${month0 + 1}/${year}`;
}

/** The current demo month key ("YYYY-MM") — the VN (UTC+7) month, like the engine. */
export function currentMonthKey(): string {
  return dateToMonthKey(DEMO_NOW);
}

/** Available months, newest first, matching the fixture span. */
export function availableMonths(): MonthOption[] {
  const current = currentMonthKey();
  return Array.from({ length: MONTH_COUNT }, (_, i) => {
    const key = addMonthsToKey(current, -i);
    return { key, label: monthKeyLabel(key) };
  });
}

/** Label for a "YYYY-MM" key. */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return labelOf(y, m - 1);
}

/** Previous month key ("YYYY-MM"). */
export function prevMonthKey(key: string): string {
  return addMonthsToKey(key, -1);
}
