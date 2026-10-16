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

/** Σ of the finite `budgetLimit`s (after `drafts`); unset/non-finite values count 0. */
function sumLimits(jars: Jar[], drafts: Record<string, number> = {}): number {
  let sum = 0;
  for (const jar of jars) {
    const override = drafts[jar.id];
    const value = override !== undefined ? override : jar.budgetLimit;
    if (value === undefined || value === null || !Number.isFinite(value)) continue;
    sum += value;
  }
  return sum;
}

/**
 * Cap kiểm: tổng `budgetLimit` các hũ (sau khi áp `drafts`) có ≤ CASA pool không.
 * `drafts` là các hạn mức MỚI theo jarId — áp theo trạng thái SAU-KHI-áp toàn bộ
 * (không từng hũ rời rạc). Hũ chưa đặt `budgetLimit` (vd. hũ tiết kiệm) không tính
 * vào Σ. Thuần, deterministic; enforce ở cả client (UX) lẫn server.
 *
 * Chỉ chặn khi lần ghi LÀM TĂNG Σ VÀ Σ mới > CASA (S5): hạ / xoá / lưu lại y hệt
 * luôn qua — kể cả khi config đang vượt trần hoặc CASA âm (sau một lần chuyển tiền).
 * Mốc so sánh (Σ trước):
 *  - `baseline` nếu truyền (server: config đang lưu; `jars` là config SAU khi áp);
 *  - nếu không, và có `drafts` → chính `jars` (chưa áp drafts) — preview client;
 *  - nếu không có cả hai → kiểm tuyệt đối (Σ `jars` ≤ CASA), như trước.
 * `casaPool === "unknown"` → chặn mọi lần TĂNG (`ok: false`, invariant #6: không có
 * mẫu số để validate); lần ghi không tăng vẫn qua.
 */
export function fitsCasaCap(
  jars: Jar[],
  casaPool: Amount,
  drafts: Record<string, number> = {},
  baseline?: Jar[],
): CasaCapResult {
  const next = sumLimits(jars, drafts);
  const prev = baseline
    ? sumLimits(baseline)
    : Object.keys(drafts).length > 0
      ? sumLimits(jars)
      : undefined;
  if (prev !== undefined && next <= prev) return { ok: true };
  if (casaPool === UNKNOWN) return { ok: false };
  return next <= casaPool ? { ok: true } : { ok: false, overBy: next - casaPool };
}
