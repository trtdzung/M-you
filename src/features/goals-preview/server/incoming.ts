import "server-only";

/**
 * Chuyển tiền từ màn Chuyển tiền tới số tài khoản mục tiêu của CHÍNH khách:
 * `/api/accounts/debit` đã trừ tài khoản nguồn và lưu bản ghi chuyển đi; ở đây
 * cộng tiền vào tài khoản mục tiêu + 1 chân credit cùng `transferGroupId`.
 * Không bao giờ ném lỗi ra ngoài — giao dịch chuyển tiền gốc không được hỏng vì Mục tiêu.
 */

import { randomUUID } from "node:crypto";
import { CATEGORY, type Transaction } from "@/domain/models";
import { goalsV2Db } from "./db";

interface OpenGoalAccountRow {
  account_id: string;
  goal_id: string;
}

export function creditOwnGoalAccountIfMatch(cif: string, txn: Transaction): void {
  try {
    const number = txn.counterpartyAccountNumber;
    if (!number || txn.direction !== "debit" || !(txn.amount > 0)) return;
    const db = goalsV2Db();
    const target = db
      .prepare(
        `SELECT ga.account_id, ga.goal_id FROM gv2_goal_accounts ga
           JOIN accounts a ON a.cif = ga.cif AND a.id = ga.account_id
          WHERE ga.cif = ? AND ga.number = ? AND ga.closed_at IS NULL`,
      )
      .get(cif, number) as OpenGoalAccountRow | undefined;
    if (!target || target.account_id === txn.accountId) return;

    const credit: Transaction = {
      id: `${txn.id.replace(/-debit$/, "")}-credit`,
      accountId: target.account_id,
      postedAt: txn.postedAt,
      amount: txn.amount,
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
      transferGroupId: txn.transferGroupId ?? `gtg-${randomUUID()}`,
      ...(txn.note ? { note: txn.note } : {}),
    };
    db.transaction(() => {
      // Idempotent: lần gửi lại của cùng giao dịch không cộng tiền lần nữa.
      if (db.prepare("SELECT 1 AS x FROM transactions WHERE cif = ? AND id = ?").get(cif, credit.id)) return;
      db.prepare(
        "UPDATE accounts SET balance = balance + @amount, available_balance = available_balance + @amount WHERE cif = @cif AND id = @id",
      ).run({ cif, id: target.account_id, amount: credit.amount });
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
    })();
  } catch (err) {
    console.error("[goals-v2] credit to own goal account failed", err);
  }
}
