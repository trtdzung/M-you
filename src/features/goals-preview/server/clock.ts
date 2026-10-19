import "server-only";

/**
 * Đồng hồ của Mục tiêu = đồng hồ chung của Scam Shield (`engineNow`), không có
 * đồng hồ riêng. "Hôm nay" là ngày VN (UTC+7) của `engineNow(cif)`; nút tua thời
 * gian dời `offsetMs` của khách đó.
 */

import { engineNow, readEngineClock, writeEngineClock } from "@/lib/security/clock";
import type { ISODate } from "../model/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày VN ("YYYY-MM-DD") của `engineNow(cif)`. */
export function goalToday(cif: string): ISODate {
  return new Date(engineNow(cif).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Tua đồng hồ của khách thêm `days` ngày (dùng chung với Scam Shield). */
export function advanceGoalClock(cif: string, days: number): void {
  const whole = Math.max(0, Math.floor(days));
  if (whole === 0) return;
  writeEngineClock(cif, { offsetMs: readEngineClock(cif).offsetMs + whole * DAY_MS });
}
