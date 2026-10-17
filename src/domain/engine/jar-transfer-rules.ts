/**
 * Jar ↔ jar (or pool) BALANCE transfer rules — the one place that decides who can
 * give / receive how much in a `dieu-chinh-hu` re-split. Shared by the Tổng quan
 * `JarTransferSheet` and the agent's `AgentRebalanceCard` (DRY; invariant #1: every
 * number comes from the engine snapshot, never from the UI or the LLM).
 *
 * This is the UI tier. The server re-checks existence / from≠to / cap on its own
 * (`api/manual-transactions/rebalance-leg-guard.ts`) — client validation is UX only.
 *
 *  - A jar's `balance` is its running balance (may be < 0), `null` = chưa có số dư
 *    (invariant #6: unknown stays unknown). It can give `cap = max(0, balance)`;
 *    with `null` it can neither give nor receive.
 *  - The pool ("Chưa phân bổ") keeps the engine's SIGNED amount as `balance`
 *    (over-allocated → negative) and can give `max(0, balance)`.
 */

import { formatVnd } from "@/lib/format";
import { POOL_DONOR_ID, POOL_DONOR_LABEL } from "./jar-funding";
import type { JarBudgetLine } from "./jar-budget-types";
import type { JarSpendable } from "./jar-spendable";
import { computeUnallocatedPool } from "./unallocated-pool";

/** One side a transfer can move balance from / to: a jar or the pool. */
export interface TransferEndpoint {
  id: string;
  label: string;
  /** Running balance (signed), or `null` when the jar has none yet. */
  balance: number | null;
  /** The most it can give: `max(0, balance)`, `null` when `balance` is `null`. */
  cap: number | null;
}

/** The snapshot fields the rules read (`JarSnapshot` from `auto-fund-core`). */
export interface TransferSnapshot {
  spendables: JarSpendable[];
  lines: JarBudgetLine[];
  casaBalance: number;
}

export interface TransferDraft {
  fromId: string;
  toId: string | null;
  amount: number | null;
}

export type TransferCheck = { ok: true } | { ok: false; field: "from" | "to" | "amount"; message: string };

export interface TransferPreview {
  from: { before: number | null; after: number | null };
  to: { before: number | null; after: number | null };
}

/** Pool first, then every jar in config order. */
export function transferEndpoints(snapshot: TransferSnapshot): TransferEndpoint[] {
  const spendableTotal = snapshot.spendables.reduce((sum, j) => sum + (j.spendable ?? 0), 0);
  const poolBalance = computeUnallocatedPool({ casaBalance: snapshot.casaBalance, spendableTotal }).amount;
  const pool: TransferEndpoint = { id: POOL_DONOR_ID, label: POOL_DONOR_LABEL, balance: poolBalance, cap: Math.max(0, poolBalance) };
  const jars = snapshot.spendables.map((j): TransferEndpoint => {
    const balance = snapshot.lines.find((l) => l.huId === j.id)?.balance ?? null;
    return { id: j.id, label: j.label, balance, cap: j.spendable === null ? null : Math.max(0, j.spendable) };
  });
  return [pool, ...jars];
}

/** The most `id` can give, `null` when it is unknown / has no balance. */
export function transferCapOf(endpoints: TransferEndpoint[], id: string): number | null {
  return endpoints.find((e) => e.id === id)?.cap ?? null;
}

/** A positive whole number of VND (odd amounts allowed — no 1.000 multiple). */
export function isValidTransferAmount(amount: number | null): amount is number {
  return amount !== null && Number.isInteger(amount) && amount > 0;
}

/** First failing rule for a draft, in field order from → to → amount. */
export function validateTransfer(draft: TransferDraft, endpoints: TransferEndpoint[]): TransferCheck {
  const from = endpoints.find((e) => e.id === draft.fromId);
  if (!from) return { ok: false, field: "from", message: "Không tìm thấy hũ chuyển." };
  if (from.cap === null) return { ok: false, field: "from", message: "Hũ này chưa có số dư." };
  if (draft.toId === null) return { ok: false, field: "to", message: "Chọn hũ nhận." };
  if (draft.toId === draft.fromId) return { ok: false, field: "to", message: "Hũ nhận phải khác hũ chuyển." };
  const to = endpoints.find((e) => e.id === draft.toId);
  if (!to) return { ok: false, field: "to", message: "Không tìm thấy hũ nhận." };
  if (to.id !== POOL_DONOR_ID && to.balance === null) return { ok: false, field: "to", message: "Hũ này chưa có số dư." };
  if (!isValidTransferAmount(draft.amount)) return { ok: false, field: "amount", message: "Nhập số tiền lớn hơn 0." };
  if (draft.amount > from.cap) return { ok: false, field: "amount", message: `Tối đa ${formatVnd(from.cap)}.` };
  return { ok: true };
}

/** Before → after balances of both sides; `null` stays `null` (never a fabricated 0). */
export function previewTransfer(draft: TransferDraft, endpoints: TransferEndpoint[]): TransferPreview {
  const amount = isValidTransferAmount(draft.amount) ? draft.amount : 0;
  const side = (id: string | null, sign: 1 | -1) => {
    const before = endpoints.find((e) => e.id === id)?.balance ?? null;
    return { before, after: before === null ? null : before + sign * amount };
  };
  return { from: side(draft.fromId, -1), to: side(draft.toId, 1) };
}
