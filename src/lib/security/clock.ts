import "server-only";

/**
 * The ONE clock of the Scam Shield engine. Every time window (60 min, 24 h,
 * 10 min, 2 days, 30 days, hold minutes) is measured with `engineNow(cif)`:
 * the app's demo clock (`transferNow`) shifted by the persona's goals-advance
 * offset (`clock_offset_ms`).
 */

import { appNow } from "@/lib/app-clock";
import { getDb } from "@/lib/db";

export type EngineClock = { offsetMs: number; alertHour: number | null; accountOpenedAt: number | null; skipHold: boolean };

export function readEngineClock(cif: string): EngineClock {
  const row = getDb().prepare("SELECT clock_offset_ms, alert_hour, account_opened_at, skip_hold FROM security_engine_state WHERE cif = ?").get(cif) as
    { clock_offset_ms: number; alert_hour: number | null; account_opened_at: number | null; skip_hold: number | null } | undefined;
  return {
    offsetMs: row?.clock_offset_ms ?? 0,
    alertHour: row?.alert_hour ?? null,
    accountOpenedAt: row?.account_opened_at ?? null,
    skipHold: row?.skip_hold === 1,
  };
}

/** Changes only the fields given. Goals advance writes `offsetMs`. */
export function writeEngineClock(cif: string, patch: Partial<EngineClock>): EngineClock {
  const next = { ...readEngineClock(cif), ...patch };
  getDb()
    .prepare(
      `INSERT INTO security_engine_state (cif, clock_offset_ms, alert_hour, account_opened_at, skip_hold, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cif) DO UPDATE SET clock_offset_ms = excluded.clock_offset_ms, alert_hour = excluded.alert_hour,
         account_opened_at = excluded.account_opened_at, skip_hold = excluded.skip_hold, updated_at = excluded.updated_at`,
    )
    .run(cif, Math.trunc(next.offsetMs), next.alertHour, next.accountOpenedAt, next.skipHold ? 1 : 0, Date.now());
  return next;
}

/** "Now" for the engine: demo clock + the persona's clock offset. */
export function engineNow(cif: string, realNow?: Date): Date {
  return appNow(cif, realNow);
}

/** When a transfer is judged — same as `engineNow` (no hour pin). */
export function engineAlertTime(cif: string, realNow?: Date): Date {
  return engineNow(cif, realNow);
}
