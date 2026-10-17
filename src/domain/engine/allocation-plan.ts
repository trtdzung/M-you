/**
 * Jar cap validator. A jar's `budgetLimit` is only its monthly plan; the money a
 * jar actually holds is its DERIVED spendable balance (`max(0, balance)`, from the
 * `jar_ledger` + spend since its anchor — `jarBalances`), so the one rule the
 * engine enforces is **Σ spendable ≤ CASA pool** — the same balance lens the
 * overview "Chờ phân bổ", the transfer picker "Chưa phân bổ" and the allocation
 * sheet all read (`pool + Σ spendable = CASA`, D26).
 *
 * Kept in the engine layer (not the component) so the check is deterministic and
 * unit-tested (invariant #1). No money movement (invariant #3) — a jar balance is
 * a display partition of money already in the account. Enforced on BOTH write
 * doors (client UX via the sheet's leftToSplit + server 422). The caller computes
 * the two Σ spendable via `evaluateJarEnvelope` (`pending.allocated`), so this
 * function never re-derives spend — it applies only the S5 accept/reject rule.
 */

import { UNKNOWN, type Amount } from "./types";

export interface CasaCapResult {
  /** True khi Σ spendable mới ≤ CASA pool (hoặc lần ghi không làm tăng Σ). */
  ok: boolean;
  /** Số VND vượt trần khi `ok=false` do vượt CASA; `undefined` khi ok hoặc pool unknown. */
  overBy?: number;
}

/**
 * Cap kiểm theo BALANCE LENS: Σ spendable mới (`nextSpendable`) có ≤ CASA pool không.
 *
 * Chỉ chặn khi lần ghi LÀM TĂNG Σ spendable VÀ Σ mới > CASA (S5): hạ / xoá / lưu
 * lại y hệt / di chuyển danh mục mà không tăng số hũ đang giữ → luôn qua, kể cả khi
 * config đang vượt trần hoặc CASA âm (sau một lần chuyển tiền rút bớt CASA).
 *
 * `baseSpendable` là Σ spendable của config TRƯỚC khi ghi (mốc so sánh). `casaPool`
 * === "unknown" (không có tài khoản current) → chặn mọi lần TĂNG (invariant #6:
 * không có mẫu số để validate); lần ghi không tăng vẫn qua.
 */
export function fitsCasaCap(
  nextSpendable: number,
  baseSpendable: number,
  casaPool: Amount,
): CasaCapResult {
  if (nextSpendable <= baseSpendable) return { ok: true };
  if (casaPool === UNKNOWN) return { ok: false };
  return nextSpendable <= casaPool ? { ok: true } : { ok: false, overBy: nextSpendable - casaPool };
}
