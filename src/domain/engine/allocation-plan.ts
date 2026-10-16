/**
 * Jar cap validator for the single-number ("một con số") model. "Chia ngay" and
 * Cài đặt both just set a jar's `budgetLimit` (its allocation = ceiling = balance),
 * so the only rule the engine enforces here is Σ budgetLimit ≤ CASA pool.
 *
 * Kept in the engine layer (not the component) so the check is deterministic and
 * unit-tested (invariant #1). No money movement (invariant #3) — a budgetLimit is
 * a display partition of money already in the account. Enforced on BOTH write
 * doors (client UX + server 422).
 */

import type { Jar } from "@/domain/models";
import { UNKNOWN, type Amount } from "./types";

export interface CasaCapResult {
  /** True khi Σ budgetLimit (sau khi áp drafts) ≤ CASA pool. */
  ok: boolean;
  /** Số VND vượt trần khi `ok=false` do vượt CASA; `undefined` khi ok hoặc pool unknown. */
  overBy?: number;
}

/**
 * Cap kiểm: tổng `budgetLimit` các hũ (sau khi áp `drafts`) có ≤ CASA pool không.
 * `drafts` là các hạn mức MỚI theo jarId — áp theo trạng thái SAU-KHI-áp toàn bộ
 * (không từng hũ rời rạc). Hũ chưa đặt `budgetLimit` (vd. hũ tiết kiệm) không tính
 * vào Σ. `casaPool === "unknown"` → chặn (`ok: false`, invariant #6: không có mẫu
 * số để validate). Thuần, deterministic; enforce ở cả client (UX) lẫn server.
 */
export function fitsCasaCap(jars: Jar[], casaPool: Amount, drafts: Record<string, number> = {}): CasaCapResult {
  if (casaPool === UNKNOWN) return { ok: false };
  let sum = 0;
  for (const jar of jars) {
    const override = drafts[jar.id];
    const value = override !== undefined ? override : jar.budgetLimit;
    if (value === undefined || value === null || !Number.isFinite(value)) continue;
    sum += value;
  }
  return sum <= casaPool ? { ok: true } : { ok: false, overBy: sum - casaPool };
}
