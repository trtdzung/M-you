import "server-only";

/**
 * Chuyển tiền từ màn Chuyển tiền tới tài khoản mục tiêu của CHÍNH khách là chuyển
 * nội bộ (D22): không đi qua `debitAccount` (hàm đó kẹp số dư về 0), mà trừ nguồn,
 * cộng tài khoản mục tiêu và ghi 2 chân cùng `transferGroupId` trong MỘT transaction
 * `IMMEDIATE` (D23) — thiếu tiền hay lỗi ở bất kỳ bước nào là không ghi gì.
 * Gửi lại cùng id: nội dung giống → trả kết quả cũ, khác → 409 (D24).
 */

import { randomUUID } from "node:crypto";
import { CATEGORY, type Account, type Transaction } from "@/domain/models";
import { AccountNotFoundError, readAccounts } from "@/lib/accounts-store";
import { upsertManualTxn } from "@/lib/manual-txns-store";
import { readTransactions } from "@/lib/transactions-store";
import { findBankByName } from "@/lib/transfer-banks";
import { goalsV2Db } from "./db";

/** Cùng id giao dịch nhưng nội dung khác lần trước (route → 409). */
export class GoalTransferConflictError extends Error {}
/** Chuyển nội bộ bị từ chối, không ghi gì (route → 422). */
export class GoalTransferRejectedError extends Error {}

interface OpenGoalAccountRow {
  account_id: string;
  goal_id: string;
}

/** Ngân hàng nhận là MSB (tên theo danh sách ngân hàng của màn Chuyển tiền). */
function isMsb(bankName: string | undefined): boolean {
  return findBankByName(bankName)?.id === "msb";
}

/** Tài khoản mục tiêu đang mở của chính cif có số này. */
function openGoalAccountByNumber(cif: string, number: string): OpenGoalAccountRow | undefined {
  return goalsV2Db()
    .prepare(
      `SELECT ga.account_id, ga.goal_id FROM gv2_goal_accounts ga
         JOIN accounts a ON a.cif = ga.cif AND a.id = ga.account_id
        WHERE ga.cif = ? AND ga.number = ? AND ga.closed_at IS NULL`,
    )
    .get(cif, number) as OpenGoalAccountRow | undefined;
}

/** D22: số nhận trùng tài khoản `goal` đang mở của chính cif **và** ngân hàng nhận là MSB. */
export function isOwnGoalTransfer(cif: string, txn: Transaction): boolean {
  const number = txn.counterpartyAccountNumber;
  if (!number || txn.direction !== "debit" || !isMsb(txn.counterpartyBankName)) return false;
  return openGoalAccountByNumber(cif, number) !== undefined;
}

/** Các trường xác định một lần chuyển — gửi lại cùng id phải giống hệt (D24). */
function sameTransfer(stored: Transaction, txn: Transaction): boolean {
  return (
    stored.amount === txn.amount &&
    stored.direction === txn.direction &&
    stored.accountId === txn.accountId &&
    (stored.counterpartyAccountNumber ?? null) === (txn.counterpartyAccountNumber ?? null) &&
    (stored.counterpartyBankName ?? null) === (txn.counterpartyBankName ?? null)
  );
}

/**
 * Đã có bản ghi cùng id: nội dung giống → `true` (gửi lại, không ghi gì nữa);
 * khác → `GoalTransferConflictError`. Chưa có → `false`. Gọi trong transaction.
 */
function checkReplay(cif: string, txn: Transaction): boolean {
  const row = goalsV2Db().prepare("SELECT source, payload FROM transactions WHERE cif = ? AND id = ?").get(cif, txn.id) as
    | { source: string; payload: string }
    | undefined;
  if (!row) return false;
  let stored: Transaction | null = null;
  try {
    stored = JSON.parse(row.payload) as Transaction;
  } catch {
    stored = null;
  }
  if (row.source !== "self_reported" || !stored || !sameTransfer(stored, txn)) {
    throw new GoalTransferConflictError(`transaction ${txn.id} already exists with different content`);
  }
  return true;
}

/**
 * Đường chuyển tiền thường (không phải nội bộ): kiểm gửi lại (D24) rồi chạy `debit`
 * (đường `debitAccount` cũ) trong cùng một transaction `IMMEDIATE`.
 */
export function guardTransferReplay<T>(cif: string, txn: Transaction | undefined, debit: () => T): T {
  const db = goalsV2Db();
  return db
    .transaction(() => {
      if (txn) checkReplay(cif, txn);
      return debit();
    })
    .immediate();
}

/**
 * Chuyển nội bộ tới tài khoản mục tiêu của chính khách (D22–D24), một transaction
 * `IMMEDIATE`: kiểm gửi lại; kiểm số dư nguồn ≥ `amount` (thiếu → từ chối, không ghi
 * gì); trừ nguồn, cộng tài khoản mục tiêu; 2 chân cùng `transferGroupId` mới — chân
 * trừ là đúng bản ghi `txn` của màn Chuyển tiền (thêm `transferGroupId`), chân cộng
 * `<id>-credit` — và `gv2_txn_kinds` = deposit. Trả danh sách tài khoản đọc lại.
 */
export function transferToOwnGoalAccount(cif: string, sourceAccountId: string, amount: number, txn: Transaction): Account[] {
  if (!Number.isFinite(amount) || amount <= 0 || txn.amount !== amount || txn.direction !== "debit") {
    throw new GoalTransferRejectedError("Số tiền không hợp lệ.");
  }
  // Seed persona (tài khoản + lịch sử giao dịch) trước khi chèn dòng của mình.
  readAccounts(cif);
  readTransactions(cif);
  const db = goalsV2Db();
  db.transaction(() => {
    if (checkReplay(cif, txn)) return;
    const number = txn.counterpartyAccountNumber;
    const target = number && isMsb(txn.counterpartyBankName) ? openGoalAccountByNumber(cif, number) : undefined;
    if (!target) throw new GoalTransferRejectedError("Tài khoản mục tiêu không còn mở.");
    if (target.account_id === sourceAccountId) throw new GoalTransferRejectedError("Tài khoản nguồn và tài khoản nhận trùng nhau.");
    const source = db
      .prepare("SELECT available_balance AS b, account_number AS number FROM accounts WHERE cif = ? AND id = ?")
      .get(cif, sourceAccountId) as { b: number; number: string | null } | undefined;
    if (!source) throw new AccountNotFoundError(sourceAccountId);
    if (source.b < amount) throw new GoalTransferRejectedError("Số dư không đủ để hoàn tất giao dịch.");

    const transferGroupId = `gtg-${randomUUID()}`;
    const debit: Transaction = { ...txn, type: "transfer", categoryId: CATEGORY.transfer, transferGroupId };
    const credit: Transaction = {
      id: `${txn.id}-credit`,
      accountId: target.account_id,
      postedAt: txn.postedAt,
      amount,
      currency: "VND",
      direction: "credit",
      type: "transfer",
      merchantName: "Nhận chuyển khoản",
      merchantNormalizedName: "goal transfer",
      categoryId: CATEGORY.transfer,
      status: "posted",
      source: "mock",
      isRecurring: false,
      userEdited: false,
      transferGroupId,
      ...(source.number ? { counterpartyAccountNumber: source.number, counterpartyBankName: "MSB" } : {}),
      ...(txn.note ? { note: txn.note } : {}),
    };
    if (db.prepare("SELECT 1 AS x FROM transactions WHERE cif = ? AND id = ?").get(cif, credit.id)) {
      throw new GoalTransferConflictError(`transaction ${credit.id} already exists`);
    }

    const move = db.prepare(
      "UPDATE accounts SET balance = balance + @delta, available_balance = available_balance + @delta WHERE cif = @cif AND id = @id",
    );
    move.run({ cif, id: sourceAccountId, delta: -amount });
    move.run({ cif, id: target.account_id, delta: amount });
    upsertManualTxn(cif, debit);
    db.prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)").run(
      cif,
      credit.id,
      credit.postedAt,
      JSON.stringify(credit),
    );
    db.prepare("INSERT INTO gv2_txn_kinds (cif, txn_id, goal_id, kind, note) VALUES (?, ?, ?, 'deposit', ?)").run(
      cif,
      credit.id,
      target.goal_id,
      txn.note ?? "Nhận chuyển khoản",
    );
  }).immediate();
  return readAccounts(cif);
}
