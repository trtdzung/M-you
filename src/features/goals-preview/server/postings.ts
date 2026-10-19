import "server-only";

/**
 * Ghi kết quả của reducer / engine (`next`) xuống DB thật: mở / đóng tài khoản
 * mục tiêu (dòng `accounts`), bút toán thật trong `transactions` cho mỗi GoalTxn mới
 * (bảng STANDARD 4.2, 2 chân cùng `transferGroupId` khi chuyển giữa 2 tài khoản
 * của khách — như `src/lib/security/fd-store.ts`), chân điều chỉnh công cụ test
 * cho phần chênh số dư TK chính không do Mục tiêu, rồi ghi đè `gv2_*`.
 * Tất cả trong MỘT transaction; cuối cùng đọc lại số dư và so với `next` —
 * lệch là throw (rollback toàn bộ).
 */

import { randomUUID } from "node:crypto";
import { CATEGORY, type Transaction } from "@/domain/models";
import { readAccounts } from "@/lib/accounts-store";
import { readTransactions } from "@/lib/transactions-store";
import { getInvestProduct, getLoanProduct } from "../data/products";
import type { WorldState } from "../model/state";
import { addDays, dayOfMonth } from "../engine/dates";
import type { GoalAccount, GoalTxn, ISODate } from "../model/types";
import { goalsV2Db } from "./db";
import { goalAccountId, readGoalMeta, soFailId } from "./world-repo";

/** Một tài khoản không đủ số dư cho một chân trừ tiền — cả thao tác bị từ chối. */
export class GoalInsufficientFundsError extends Error {}
/** Số dư đọc lại không khớp kết quả reducer — rollback. */
export class GoalPostingMismatchError extends Error {}

const ADJUST_NOTE = "Điều chỉnh từ công cụ test";
const MAIN_NAME = "Tài khoản chính";

type Direction = "debit" | "credit";

interface Leg {
  txn: Transaction;
  /** Ghi `gv2_txn_kinds` cho chân này (chân trên tài khoản mục tiêu). */
  kind?: { goalId: string; kind: GoalTxn["kind"]; note: string };
}

/** Lịch chạy tự động (lệnh trích, lãi, trả góp, đáo hạn) ghi lúc 09:00 giờ VN của ngày đó. */
function autoPostedAt(date: ISODate): string {
  return `${date}T02:00:00.000Z`;
}

function maskedOf(number: string): string {
  return `•••• ${number.slice(-4)}`;
}

/**
 * Số tài khoản mục tiêu duy nhất toàn hệ thống (D10): "88" + 4 số cuối phần số của
 * cif (đệm 0) + seq lúc mở đệm 6 số = 12 số.
 */
function goalAccountNumber(cif: string, seq: number): string {
  const cifDigits = cif.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `88${cifDigits}${String(seq % 1_000_000).padStart(6, "0")}`;
}

/**
 * Tài khoản do reducer mở có id `acc-<seq>` và số giả lập; tài khoản thật dùng
 * `goalacc-<goalId>` (STANDARD 4.1) và số theo D10. Đổi trong `next` (tài khoản,
 * mục tiêu, giao dịch) trước khi ghi.
 */
function normalizeOpenedAccounts(cif: string, prev: WorldState, next: WorldState): void {
  const known = new Set(prev.accounts.map((a) => a.id));
  for (const account of next.accounts) {
    if (known.has(account.id)) continue;
    const seq = Number(/^acc-(\d+)$/.exec(account.id)?.[1] ?? next.seq);
    account.number = goalAccountNumber(cif, seq);
    const realId = goalAccountId(account.goalId);
    if (account.id === realId) continue;
    const oldId = account.id;
    account.id = realId;
    for (const goal of next.goals) if (goal.accountId === oldId) goal.accountId = realId;
    for (const txn of next.txns) if (txn.accountId === oldId) txn.accountId = realId;
  }
}

/**
 * Ghi `next` xuống DB. `postedAt` = thời điểm thao tác của khách
 * (`engineNow(cif).toISOString()`); `null` = việc tự chạy theo ngày → `${date}T02:00:00.000Z`.
 * MUTATES `next` (chỉ đổi id / số của tài khoản mới mở).
 */
export function applyPostings(cif: string, prev: WorldState, next: WorldState, postedAt: string | null): void {
  // Seed lịch sử persona trước khi chèn dòng của mình (seed chỉ chạy khi bảng trống, như fd-store).
  readTransactions(cif);
  const main = readAccounts(cif).find((a) => a.type === "current");
  if (!main) throw new RangeError("Unknown customer");

  normalizeOpenedAccounts(cif, prev, next);

  const prevAccountIds = new Set(prev.accounts.map((a) => a.id));
  const accountById = new Map<string, GoalAccount>(next.accounts.map((a) => [a.id, a]));
  const opened = next.accounts.filter((a) => !prevAccountIds.has(a.id));
  const closed = next.accounts.filter(
    (a) => a.status === "closed" && prev.accounts.some((p) => p.id === a.id && p.status === "open"),
  );
  const prevTxnIds = new Set(prev.txns.map((t) => t.id));
  const newTxns = next.txns.filter((t) => !prevTxnIds.has(t.id));
  const prevAssetIds = new Set(prev.assets.map((a) => a.id));
  const prevLoanIds = new Set(prev.loans.map((l) => l.id));

  const stamp = (date: ISODate) => postedAt ?? autoPostedAt(date);
  const base = (amount: number, at: string, type: Transaction["type"], note: string) => ({
    postedAt: at,
    amount,
    currency: "VND",
    type,
    categoryId: CATEGORY.transfer,
    status: "posted" as const,
    source: "mock" as const,
    isRecurring: false,
    userEdited: false,
    note,
  });
  const single = (
    accountId: string,
    direction: Direction,
    amount: number,
    at: string,
    type: Transaction["type"],
    merchantName: string,
    note: string,
  ): Transaction => ({
    ...base(amount, at, type, note),
    id: `gt-${randomUUID()}-${direction}`,
    accountId,
    direction,
    merchantName,
    merchantNormalizedName: "goal account",
  });
  /** 2 chân cùng `transferGroupId`: `from` bị trừ, `to` được cộng. */
  const pair = (
    from: { accountId: string; merchantName: string },
    to: { accountId: string; merchantName: string },
    amount: number,
    at: string,
    note: string,
  ): { debit: Transaction; credit: Transaction } => {
    const id = `gt-${randomUUID()}`;
    const shared = { ...base(amount, at, "transfer", note), transferGroupId: `gtg-${randomUUID()}` };
    return {
      debit: { ...shared, id: `${id}-debit`, accountId: from.accountId, direction: "debit", merchantName: from.merchantName, merchantNormalizedName: "goal transfer" },
      credit: { ...shared, id: `${id}-credit`, accountId: to.accountId, direction: "credit", merchantName: to.merchantName, merchantNormalizedName: "goal transfer" },
    };
  };

  const legs: Leg[] = [];
  const failures: GoalTxn[] = [];
  let mainDelta = 0;
  for (const t of newTxns) {
    const account = accountById.get(t.accountId);
    if (!account) throw new GoalPostingMismatchError(`txn ${t.id}: unknown goal account ${t.accountId}`);
    const at = stamp(t.date);
    const kind = { goalId: t.goalId, kind: t.kind, note: t.note };
    const amount = Math.round(t.amount);
    switch (t.kind) {
      case "deposit":
      case "standing_order": {
        const { debit, credit } = pair(
          { accountId: main.id, merchantName: `Chuyển vào ${account.name}` },
          { accountId: account.id, merchantName: `Nhận từ ${MAIN_NAME.toLowerCase()}` },
          amount,
          at,
          t.note,
        );
        legs.push({ txn: debit }, { txn: credit, kind });
        mainDelta -= amount;
        break;
      }
      case "withdraw": {
        const { debit, credit } = pair(
          { accountId: account.id, merchantName: `Chuyển về ${MAIN_NAME.toLowerCase()}` },
          { accountId: main.id, merchantName: `Nhận từ ${account.name}` },
          amount,
          at,
          t.note,
        );
        legs.push({ txn: debit, kind }, { txn: credit });
        mainDelta += amount;
        break;
      }
      case "invest": {
        const asset = next.assets.find((a) => a.goalId === t.goalId && a.type === "liquid" && !prevAssetIds.has(a.id));
        const product = asset?.type === "liquid" ? getInvestProduct(asset.productId) : undefined;
        legs.push({ txn: single(account.id, "debit", amount, at, "transfer", product?.name ?? t.note, t.note), kind });
        break;
      }
      case "divest":
      case "maturity":
        legs.push({ txn: single(account.id, "credit", amount, at, "transfer", t.note, t.note), kind });
        break;
      case "interest":
        legs.push({ txn: single(account.id, "credit", amount, at, "income", t.note, t.note), kind });
        break;
      case "loan_disbursement": {
        const loan = next.loans.find((l) => l.goalId === t.goalId && !prevLoanIds.has(l.id));
        const product = loan ? getLoanProduct(loan.productId) : undefined;
        legs.push({ txn: single(account.id, "credit", amount, at, "transfer", product?.name ?? t.note, t.note), kind });
        break;
      }
      case "loan_repayment":
        legs.push({ txn: single(account.id, "debit", amount, at, "transfer", t.note, t.note), kind });
        break;
      case "standing_order_failed":
        failures.push(t);
        break;
    }
  }

  // Phần chênh TK chính không do giao dịch Mục tiêu (lương / chi tiêu mô phỏng của công cụ test).
  let adjust = Math.round(next.customer.mainCasaBalance - prev.customer.mainCasaBalance - mainDelta);
  const adjustLeg = (amount: number, at: string): Leg => ({
    txn: single(main.id, amount > 0 ? "credit" : "debit", Math.abs(amount), at, "transfer", ADJUST_NOTE, ADJUST_NOTE),
  });
  /** Chân lương mô phỏng (D11): mỗi ngày lương trong khoảng tua 1 chân, ghi trước việc khác cùng ngày như engine. */
  const salaryLegs: Leg[] = [];
  if (postedAt === null) {
    const c = prev.customer;
    const net = Math.round(c.monthlyIncome - c.monthlyExpenses - c.existingDebtPayment);
    for (let d = addDays(prev.clock.today, 1); d <= next.clock.today && net !== 0; d = addDays(d, 1)) {
      if (dayOfMonth(d) !== c.salaryDay) continue;
      salaryLegs.push(adjustLeg(net, autoPostedAt(d)));
      adjust -= net;
    }
  }
  const timed: Leg[] = [...salaryLegs, ...legs];
  // Phần còn lại (sự kiện công cụ test): tiền vào ghi trước, tiền ra ghi sau các chân cùng thời điểm.
  if (adjust > 0) timed.unshift(adjustLeg(adjust, stamp(next.clock.today)));
  if (adjust < 0) timed.push(adjustLeg(adjust, stamp(next.clock.today)));
  // Theo thời gian; cùng thời điểm thì giữ thứ tự ở trên (lương trước việc khác trong ngày).
  const ordered: Leg[] = timed
    .map((leg, i) => ({ leg, i }))
    .sort((a, b) => (a.leg.txn.postedAt < b.leg.txn.postedAt ? -1 : a.leg.txn.postedAt > b.leg.txn.postedAt ? 1 : a.i - b.i))
    .map((x) => x.leg);

  const db = goalsV2Db();
  const meta = readGoalMeta(cif);
  const processedThrough =
    meta.processedThrough && meta.processedThrough > next.clock.today ? meta.processedThrough : next.clock.today;

  db.transaction(() => {
    // 1. Tài khoản mới mở.
    const { maxOrder } = db.prepare("SELECT MAX(sort_order) AS maxOrder FROM accounts WHERE cif = ?").get(cif) as {
      maxOrder: number | null;
    };
    let sortOrder = (maxOrder ?? -1) + 1;
    const insertAccount = db.prepare(
      `INSERT INTO accounts
         (cif, id, type, institution, currency, balance, available_balance, last_synced_at, source, tier, masked_number, account_number, sort_order)
       VALUES (?, ?, 'goal', 'MSB', 'VND', 0, 0, ?, 'mock', NULL, ?, ?, ?)`,
    );
    const insertGoalAccount = db.prepare(
      `INSERT INTO gv2_goal_accounts (cif, account_id, goal_id, number, name, interest_rate_pa, opened_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    );
    for (const a of opened) {
      insertAccount.run(cif, a.id, postedAt ?? autoPostedAt(a.openedAt), maskedOf(a.number), a.number, sortOrder++);
      insertGoalAccount.run(cif, a.id, a.goalId, a.number, a.name, a.interestRatePa, a.openedAt);
    }

    // 2. Bút toán, kiểm tra đủ số dư trước mỗi chân trừ tiền.
    const readBalance = db.prepare("SELECT available_balance AS b FROM accounts WHERE cif = ? AND id = ?");
    const move = db.prepare(
      "UPDATE accounts SET balance = balance + @delta, available_balance = available_balance + @delta WHERE cif = @cif AND id = @id",
    );
    const insertTxn = db.prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)");
    const insertKind = db.prepare("INSERT INTO gv2_txn_kinds (cif, txn_id, goal_id, kind, note) VALUES (?, ?, ?, ?, ?)");
    for (const { txn, kind } of ordered) {
      const row = readBalance.get(cif, txn.accountId) as { b: number } | undefined;
      if (!row) throw new GoalPostingMismatchError(`account ${txn.accountId} not found`);
      if (txn.direction === "debit" && Math.round(row.b) < txn.amount) {
        throw new GoalInsufficientFundsError(
          txn.accountId === main.id ? "Tài khoản chính không đủ số dư." : "Số dư tài khoản mục tiêu không đủ.",
        );
      }
      move.run({ cif, id: txn.accountId, delta: txn.direction === "debit" ? -txn.amount : txn.amount });
      insertTxn.run(cif, txn.id, txn.postedAt, JSON.stringify(txn));
      if (kind) insertKind.run(cif, txn.id, kind.goalId, kind.kind, kind.note);
    }
    for (const f of failures) insertKind.run(cif, soFailId(f.date, f.amount, randomUUID().slice(0, 8)), f.goalId, f.kind, f.note);

    // 3. Tài khoản đóng: xoá dòng `accounts`, giữ lịch sử ở `gv2_goal_accounts` + `transactions`.
    const closeAccount = db.prepare("UPDATE gv2_goal_accounts SET closed_at = ? WHERE cif = ? AND account_id = ?");
    for (const a of closed) {
      const row = readBalance.get(cif, a.id) as { b: number } | undefined;
      if (row && Math.round(row.b) !== 0) throw new GoalPostingMismatchError(`closing ${a.id} with balance ${row.b}`);
      db.prepare("DELETE FROM accounts WHERE cif = ? AND id = ?").run(cif, a.id);
      closeAccount.run(next.clock.today, cif, a.id);
    }

    // 4. Ghi đè dữ liệu Mục tiêu theo `next`.
    db.prepare("DELETE FROM gv2_goals WHERE cif = ?").run(cif);
    const insertGoal = db.prepare("INSERT INTO gv2_goals (cif, id, payload, sort_order) VALUES (?, ?, ?, ?)");
    next.goals.forEach((g, i) => insertGoal.run(cif, g.id, JSON.stringify(g), i));
    db.prepare("DELETE FROM gv2_assets WHERE cif = ?").run(cif);
    const insertAsset = db.prepare("INSERT INTO gv2_assets (cif, id, goal_id, payload) VALUES (?, ?, ?, ?)");
    for (const a of next.assets) insertAsset.run(cif, a.id, a.goalId, JSON.stringify(a));
    db.prepare("DELETE FROM gv2_loans WHERE cif = ?").run(cif);
    const insertLoan = db.prepare("INSERT INTO gv2_loans (cif, id, goal_id, payload) VALUES (?, ?, ?, ?)");
    for (const l of next.loans) insertLoan.run(cif, l.id, l.goalId, JSON.stringify(l));
    db.prepare(
      `INSERT INTO gv2_meta (cif, seq, processed_through, fund_price_shift_pct, risk_profile, risk_profile_asked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cif) DO UPDATE SET seq = excluded.seq, processed_through = excluded.processed_through,
         fund_price_shift_pct = excluded.fund_price_shift_pct, risk_profile = excluded.risk_profile,
         risk_profile_asked_at = COALESCE(gv2_meta.risk_profile_asked_at, excluded.risk_profile_asked_at), updated_at = excluded.updated_at`,
    ).run(cif, next.seq, processedThrough, next.market.fundPriceShiftPct, next.customer.riskProfile, next.customer.riskProfileAsked === true ? new Date().toISOString() : null, new Date().toISOString());

    // 5. Đọc lại số dư thật và so với kết quả reducer.
    const mainNow = readBalance.get(cif, main.id) as { b: number } | undefined;
    if (!mainNow || Math.round(mainNow.b) !== Math.round(next.customer.mainCasaBalance)) {
      throw new GoalPostingMismatchError(`main CASA ${mainNow?.b} ≠ ${next.customer.mainCasaBalance}`);
    }
    const readBoth = db.prepare("SELECT balance, available_balance FROM accounts WHERE cif = ? AND id = ?");
    for (const a of next.accounts) {
      const row = readBoth.get(cif, a.id) as { balance: number; available_balance: number } | undefined;
      if (a.status === "closed") {
        if (row) throw new GoalPostingMismatchError(`closed account ${a.id} still has a row`);
        if (Math.round(a.balance) !== 0) throw new GoalPostingMismatchError(`closed account ${a.id} balance ${a.balance}`);
        continue;
      }
      if (!row || Math.round(row.balance) !== Math.round(a.balance) || Math.round(row.available_balance) !== Math.round(a.balance)) {
        throw new GoalPostingMismatchError(`goal account ${a.id} ${row?.balance} ≠ ${a.balance}`);
      }
    }
  })();
}
