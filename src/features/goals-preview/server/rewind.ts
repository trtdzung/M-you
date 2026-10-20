import "server-only";

/**
 * Công cụ test: đưa đồng hồ của khách về giờ thật và xoá mọi thứ do việc tua thời gian
 * tạo ra sau "hôm nay" (D-test). Làm trong MỘT transaction:
 * - bút toán `gt-*` có `posted_at` sau bây giờ: hoàn số dư hai chân rồi xoá (cùng `gv2_txn_kinds`);
 * - mục tiêu / tài sản tạo sau hôm nay: xoá cùng khoản vay, tài khoản mục tiêu của chúng;
 * - lịch trả nợ: kỳ trả sau hôm nay trở lại chưa trả, kỳ "quá hạn" chưa tới hạn thành sắp tới;
 * - lệnh trích tự động đã chạy sau hôm nay: bỏ kết quả, dời `nextRunDate` về lần tới thật;
 * - `processed_through` lùi về hôm nay, `offsetMs` về 0.
 * Không hoàn tác được trạng thái mục tiêu đã đổi trong lúc tua (đạt mục tiêu, đóng...) — kết quả trả về đếm riêng.
 */

import { engineNow, writeEngineClock } from "@/lib/security/clock";
import { nextDayOfMonth } from "../engine/dates";
import { refreshLoanStatuses } from "../engine/lifecycle";
import type { Asset, Goal, Loan } from "../model/types";
import { goalsV2Db } from "./db";
import { goalToday } from "./clock";

export interface RewindResult {
  today: string;
  removedTransactions: number;
  removedGoals: number;
  removedAssets: number;
  resetInstalments: number;
  resetStandingOrders: number;
  /** Mục tiêu còn mang mốc đạt / đóng sau hôm nay: trạng thái giữ nguyên. */
  goalsWithFutureStatus: string[];
}

interface TxnRow {
  id: string;
  payload: string;
}

export function rewindToNow(cif: string): RewindResult {
  const db = goalsV2Db();
  const result: RewindResult = {
    today: "",
    removedTransactions: 0,
    removedGoals: 0,
    removedAssets: 0,
    resetInstalments: 0,
    resetStandingOrders: 0,
    goalsWithFutureStatus: [],
  };

  db.transaction(() => {
    writeEngineClock(cif, { offsetMs: 0 });
    const cutoff = engineNow(cif).toISOString();
    const today = goalToday(cif);
    result.today = today;

    // 1. Bút toán mục tiêu ở tương lai: hoàn số dư rồi xoá.
    const moveBack = db.prepare(
      "UPDATE accounts SET balance = balance + @delta, available_balance = available_balance + @delta WHERE cif = @cif AND id = @id",
    );
    const future = db.prepare("SELECT id, payload FROM transactions WHERE cif = ? AND id LIKE 'gt-%' AND posted_at > ?").all(cif, cutoff) as TxnRow[];
    for (const row of future) {
      const txn = JSON.parse(row.payload) as { accountId: string; direction: "debit" | "credit"; amount: number };
      moveBack.run({ cif, id: txn.accountId, delta: txn.direction === "debit" ? txn.amount : -txn.amount });
      db.prepare("DELETE FROM transactions WHERE cif = ? AND id = ?").run(cif, row.id);
      db.prepare("DELETE FROM gv2_txn_kinds WHERE cif = ? AND txn_id = ?").run(cif, row.id);
    }
    result.removedTransactions = future.length;
    // Lệnh trích thất bại mang ngày trong id (không có dòng `transactions`).
    for (const { txn_id } of db.prepare("SELECT txn_id FROM gv2_txn_kinds WHERE cif = ? AND txn_id LIKE 'sofail-%'").all(cif) as { txn_id: string }[]) {
      const date = /^sofail-(\d{4}-\d{2}-\d{2})-/.exec(txn_id)?.[1];
      if (date && date > today) db.prepare("DELETE FROM gv2_txn_kinds WHERE cif = ? AND txn_id = ?").run(cif, txn_id);
    }

    // 2. Mục tiêu tạo sau hôm nay (kèm tài sản, khoản vay, tài khoản).
    const goals = (db.prepare("SELECT id, payload FROM gv2_goals WHERE cif = ? ORDER BY sort_order ASC, id ASC").all(cif) as TxnRow[]).map((r) => ({ id: r.id, goal: JSON.parse(r.payload) as Goal }));
    const doomed = new Set(goals.filter((g) => g.goal.createdAt > today).map((g) => g.id));
    for (const id of doomed) {
      for (const table of ["gv2_assets", "gv2_loans", "gv2_txn_kinds"]) db.prepare(`DELETE FROM ${table} WHERE cif = ? AND goal_id = ?`).run(cif, id);
      for (const { account_id } of db.prepare("SELECT account_id FROM gv2_goal_accounts WHERE cif = ? AND goal_id = ?").all(cif, id) as { account_id: string }[]) {
        db.prepare("DELETE FROM accounts WHERE cif = ? AND id = ?").run(cif, account_id);
      }
      db.prepare("DELETE FROM gv2_goal_accounts WHERE cif = ? AND goal_id = ?").run(cif, id);
      db.prepare("DELETE FROM gv2_goals WHERE cif = ? AND id = ?").run(cif, id);
    }
    result.removedGoals = doomed.size;

    // 3. Tài sản tạo sau hôm nay.
    for (const row of db.prepare("SELECT id, payload FROM gv2_assets WHERE cif = ?").all(cif) as TxnRow[]) {
      if ((JSON.parse(row.payload) as Asset).createdAt > today) {
        db.prepare("DELETE FROM gv2_assets WHERE cif = ? AND id = ?").run(cif, row.id);
        result.removedAssets += 1;
      }
    }

    // 4. Lịch trả nợ.
    for (const row of db.prepare("SELECT id, payload FROM gv2_loans WHERE cif = ?").all(cif) as TxnRow[]) {
      const loan = JSON.parse(row.payload) as Loan;
      let changed = false;
      for (const r of loan.schedule) {
        if (r.status === "paid" && r.paidAt && r.paidAt > today) {
          r.status = r.dueDate <= today ? "overdue" : "upcoming";
          delete r.paidAt;
          changed = true;
          result.resetInstalments += 1;
        } else if (r.status === "overdue" && r.dueDate > today) {
          r.status = "upcoming";
          changed = true;
          result.resetInstalments += 1;
        }
      }
      if (!changed) continue;
      if (loan.status === "paid_off") loan.status = "active";
      refreshLoanStatuses(loan, today);
      db.prepare("UPDATE gv2_loans SET payload = ? WHERE cif = ? AND id = ?").run(JSON.stringify(loan), cif, row.id);
    }

    // 5. Lệnh trích tự động và mốc trạng thái mục tiêu.
    for (const { id, goal } of goals) {
      if (doomed.has(id)) continue;
      const so = goal.standingOrder;
      if (so?.lastRunDate && so.lastRunDate > today) {
        delete so.lastRunDate;
        delete so.lastResult;
        so.failedCount = 0;
        so.nextRunDate = nextDayOfMonth(today, so.dayOfMonth);
        db.prepare("UPDATE gv2_goals SET payload = ? WHERE cif = ? AND id = ?").run(JSON.stringify(goal), cif, id);
        result.resetStandingOrders += 1;
      }
      if ([goal.achievedAt, goal.completedAt, goal.closedAt].some((d) => d && d > today)) result.goalsWithFutureStatus.push(id);
    }

    // 6. Mốc đã xử lý lùi về hôm nay.
    db.prepare("UPDATE gv2_meta SET processed_through = ? WHERE cif = ? AND processed_through > ?").run(today, cif, today);
  })();

  return result;
}
