import "server-only";

import { transferNow, monthKeyLabel, type MonthOption } from "@/lib/demo-clock";
import { readEngineClock } from "@/lib/security/clock";
import { addMonthsToKey, dateToMonthKey } from "@/domain/engine/types";

export function appNow(cif: string, realNow?: Date): Date {
  return new Date(transferNow(realNow).getTime() + readEngineClock(cif).offsetMs);
}

export function appToday(cif: string): string {
  return new Date(appNow(cif).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function appMonthKey(cif: string): string {
  return dateToMonthKey(appNow(cif));
}

export function appAvailableMonths(cif: string): MonthOption[] {
  const current = appMonthKey(cif);
  return Array.from({ length: 6 }, (_, i) => {
    const key = addMonthsToKey(current, -i);
    return { key, label: monthKeyLabel(key) };
  });
}
