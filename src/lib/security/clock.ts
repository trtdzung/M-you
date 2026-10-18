import "server-only";

/**
 * The ONE clock of the Scam Shield engine. Every time window (60 min, 24 h,
 * 10 min, 2 days, 30 days, hold minutes) is measured with `engineNow(cif)`:
 * the app's demo clock (`transferNow`) shifted by the persona's test-tools
 * offset. `engineAlertTime` additionally pins the hour warnings are judged at.
 */

import { transferNow } from "@/lib/demo-clock";
import { getDb } from "@/lib/db";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;

export type EngineClock = { offsetMs: number; alertHour: number | null; accountOpenedAt: number | null };

export function readEngineClock(cif: string): EngineClock {
  const row = getDb().prepare("SELECT clock_offset_ms, alert_hour, account_opened_at FROM security_engine_state WHERE cif = ?").get(cif) as
    { clock_offset_ms: number; alert_hour: number | null; account_opened_at: number | null } | undefined;
  return { offsetMs: row?.clock_offset_ms ?? 0, alertHour: row?.alert_hour ?? null, accountOpenedAt: row?.account_opened_at ?? null };
}

/** Changes only the fields given; `alertHour: null` returns to the real hour. */
export function writeEngineClock(cif: string, patch: Partial<EngineClock>): EngineClock {
  const next = { ...readEngineClock(cif), ...patch };
  getDb()
    .prepare(
      `INSERT INTO security_engine_state (cif, clock_offset_ms, alert_hour, account_opened_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cif) DO UPDATE SET clock_offset_ms = excluded.clock_offset_ms, alert_hour = excluded.alert_hour,
         account_opened_at = excluded.account_opened_at, updated_at = excluded.updated_at`,
    )
    .run(cif, Math.trunc(next.offsetMs), next.alertHour, next.accountOpenedAt, Date.now());
  return next;
}

/** "Now" for the engine: demo clock + the persona's test-tools offset. */
export function engineNow(cif: string, realNow?: Date): Date {
  return new Date(transferNow(realNow).getTime() + readEngineClock(cif).offsetMs);
}

/** When a transfer is judged: `engineNow`, or the same VN day at the pinned hour. */
export function engineAlertTime(cif: string, realNow?: Date): Date {
  const now = engineNow(cif, realNow);
  const { alertHour } = readEngineClock(cif);
  if (alertHour === null) return now;
  const vnDayStart = Math.floor((now.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(vnDayStart + alertHour * HOUR_MS - VN_OFFSET_MS);
}
