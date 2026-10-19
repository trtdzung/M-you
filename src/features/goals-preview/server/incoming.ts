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
 * D30: có dòng `gv2_transfer_sources` mà nguồn trừ thật khác `sourceAccountId` → khác;
 * chưa có dòng (giao dịch trước T16) → chỉ so `sameTransfer`.
 */
function checkReplay(cif: string, txn: Transaction, sourceAccountId: string): boolean {
  const db = goalsV2Db();
  const row = db.prepare("SELECT source, payload FROM transactions WHERE cif = ? AND id = ?").get(cif, txn.id) as
    | { source: string; payload: string }
    | undefined;
  if (!row) return false;
  let stored: Transaction | null = null;
  try {
    stored = JSON.parse(row.payload) as Transaction;
  } catch {
    stored = null;
  }
  const origin = db
    .prepare("SELECT source_account_id AS id FROM gv2_transfer_sources WHERE cif = ? AND txn_id = ?")
    .get(cif, txn.id) as { id: string } | undefined;
  if (
    row.source !== "self_reported" ||
    !stored ||
    !sameTransfer(stored, txn) ||
    (origin !== undefined && origin.id !== sourceAccountId)
  ) {
    throw new GoalTransferConflictError(`transaction ${txn.id} already exists with different content`);
  }
  return true;
}

/**
 * D30: lưu nguồn trừ thật của lần ghi đầu, gọi trong cùng transaction với bút toán.
 * Chỉ tới đây khi chưa có dòng `transactions` cùng id, nên dòng nguồn cũ (nếu còn sót
 * lại sau khi giao dịch bị xoá) được thay.
 */
function recordTransferSource(cif: string, txnId: string, sourceAccountId: string): void {
  goalsV2Db()
    .prepare(
      "INSERT OR REPLACE INTO gv2_transfer_sources (cif, txn_id, source_account_id, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(cif, txnId, sourceAccountId, new Date().toISOString());
}

/** Loại tài khoản nguồn của cif (`undefined` = không có). */
function sourceType(cif: string, sourceAccountId: string): string | undefined {
  const row = goalsV2Db().prepare("SELECT type FROM accounts WHERE cif = ? AND id = ?").get(cif, sourceAccountId) as
    | { type: string }
    | undefined;
  return row?.type;
}

/**
 * D29: nguồn là tài khoản `goal` → chân trừ mang `accountId` = id tài khoản nguồn thật (sổ
 * của tài khoản mục tiêu đủ chân). Nguồn khác → giữ nguyên bản ghi của màn Chuyển tiền.
 */
function debitRecordFor(cif: string, sourceAccountId: string, txn: Transaction): Transaction {
  return sourceType(cif, sourceAccountId) === "goal" ? { ...txn, accountId: sourceAccountId } : txn;
}

/**
 * Đường chuyển tiền thường (không phải nội bộ), một transaction `IMMEDIATE`: kiểm gửi lại
 * (D24) rồi chạy `debit` (đường `debitAccount` cũ) với bản ghi đã chuẩn hoá. Nguồn là tài
 * khoản `goal` (D29): kiểm đủ số dư trước — thiếu → từ chối, không kẹp về 0, không ghi gì.
 */
export function guardTransferReplay<T>(
  cif: string,
  sourceAccountId: string,
  amount: number,
  txn: Transaction | undefined,
  debit: (record: Transaction | undefined) => T,
): T {
  readAccounts(cif); // seed persona trước khi đọc loại tài khoản
  const db = goalsV2Db();
  return db
    .transaction(() => {
      const record = txn ? debitRecordFor(cif, sourceAccountId, txn) : undefined;
      if (record && checkReplay(cif, record, sourceAccountId)) return debit(record);
      if (sourceType(cif, sourceAccountId) === "goal") {
        const row = db.prepare("SELECT available_balance AS b FROM accounts WHERE cif = ? AND id = ?").get(cif, sourceAccountId) as
          | { b: number }
          | undefined;
        if (!row || row.b < amount) throw new GoalTransferRejectedError("Số dư không đủ để hoàn tất giao dịch.");
      }
      const result = debit(record);
      if (record) recordTransferSource(cif, record.id, sourceAccountId);
      return result;
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
    const record = debitRecordFor(cif, sourceAccountId, txn);
    if (checkReplay(cif, record, sourceAccountId)) return;
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
    const debit: Transaction = { ...record, type: "transfer", categoryId: CATEGORY.transfer, transferGroupId };
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
    recordTransferSource(cif, record.id, sourceAccountId);
  }).immediate();
  return readAccounts(cif);
}
