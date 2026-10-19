import type { WorldState } from "../model/state";
import { TXN_DIRECTION, type Goal, type GoalTxn, type GoalTxnKind, type ISODate } from "../model/types";

/**
 * Low-level mutators used by the reducer and `advanceTime`. They MUTATE the
 * given draft (callers clone first with `structuredClone`).
 */

export function nextId(draft: Pick<WorldState, "seq">, prefix: string): string {
  draft.seq += 1;
  return `${prefix}-${draft.seq}`;
}

/**
 * Số tài khoản mục tiêu duy nhất toàn hệ thống (D10): "88" + 4 số cuối phần số của cif (đệm 0) +
 * seq lúc mở đệm 6 số = 12 số. Server cấp số này; màn tạo dùng cùng công thức để hiện số dự kiến.
 */
export function goalAccountNumber(cif: string, seq: number): string {
  const cifDigits = cif.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `88${cifDigits}${String(seq % 1_000_000).padStart(6, "0")}`;
}

/** Deterministic 12-digit goal account number, MSB-like prefix (số giả lập của reducer, server sẽ thay). */
export function makeAccountNumber(seed: number): string {
  const body = String((seed * 7919 + 104_729) % 100_000_000).padStart(8, "0");
  return `9668${body}`;
}

/**
 * Posts a transaction on the goal account and updates its balance.
 * Returns the txn, or null when the goal has no account.
 */
export function postTxn(
  draft: WorldState,
  goal: Goal,
  kind: GoalTxnKind,
  amount: number,
  date: ISODate,
  note: string,
): GoalTxn | null {
  const account = goal.accountId ? draft.accounts.find((a) => a.id === goal.accountId) : undefined;
  if (!account) return null;
  const rounded = Math.round(amount);
  account.balance += TXN_DIRECTION[kind] * rounded;
  const txn: GoalTxn = {
    id: nextId(draft, "txn"),
    goalId: goal.id,
    accountId: account.id,
    kind,
    amount: rounded,
    date,
    note,
    balanceAfter: account.balance,
  };
  draft.txns.push(txn);
  return txn;
}

export function findGoal(draft: Pick<WorldState, "goals">, goalId: string | undefined): Goal | undefined {
  return goalId ? draft.goals.find((g) => g.id === goalId) : undefined;
}

export function goalBalance(draft: Pick<WorldState, "accounts">, goal: Goal): number {
  return goal.accountId ? draft.accounts.find((a) => a.id === goal.accountId)?.balance ?? 0 : 0;
}
