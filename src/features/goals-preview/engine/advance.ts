import { getInvestProduct } from "../data/products";
import type { WorldState } from "../model/state";
import type { ISODate } from "../model/types";
import { addDays, dayOfMonth, formatMonths, nextDayOfMonth } from "./dates";
import { findGoal, postTxn } from "./ledger";
import { applyLifecycle, refreshLoanStatuses, type LifecycleEvent } from "./lifecycle";
import { depositAccrued, fundPriceAt } from "./value";
import { formatVnd } from "@/features/goals-preview/format-money";

export interface AdvanceSummary {
  days: number;
  from: ISODate;
  to: ISODate;
  standingOrdersOk: number;
  standingOrdersFailed: number;
  interestTotal: number;
  maturities: number;
  instalmentsPaid: number;
  instalmentsOverdue: number;
  lifecycle: LifecycleEvent[];
}

/** Credits salary and debits living costs on the customer's main CASA (mutates). */
export function applySalary(draft: WorldState): void {
  const c = draft.customer;
  c.mainCasaBalance += c.monthlyIncome - c.monthlyExpenses - c.existingDebtPayment;
}

/**
 * Runs one standing order now (mutates). Fails — and records a
 * `standing_order_failed` txn — when the main CASA is short.
 */
export function runStandingOrder(draft: WorldState, goalId: string, date: ISODate): "ok" | "failed" | "skipped" {
  const goal = findGoal(draft, goalId);
  const so = goal?.standingOrder;
  if (!goal || !so || !so.active || !goal.accountId) return "skipped";
  so.lastRunDate = date;
  so.nextRunDate = nextDayOfMonth(date, so.dayOfMonth);
  if (draft.customer.mainCasaBalance >= so.amount) {
    draft.customer.mainCasaBalance -= so.amount;
    postTxn(draft, goal, "standing_order", so.amount, date, `Trích tự động ngày ${so.dayOfMonth} hằng tháng`);
    so.lastResult = "ok";
    so.failedCount = 0;
    return "ok";
  }
  postTxn(draft, goal, "standing_order_failed", so.amount, date, "Tài khoản chính không đủ số dư");
  so.lastResult = "failed";
  so.failedCount += 1;
  return "failed";
}

/** Pays every due/overdue instalment of active loans that the goal account can cover (mutates). */
export function payDueInstalments(draft: WorldState, date: ISODate, summary?: AdvanceSummary): void {
  for (const loan of draft.loans) {
    if (loan.status !== "active") continue;
    const goal = findGoal(draft, loan.goalId);
    if (!goal) continue;
    for (const row of loan.schedule) {
      if (row.status === "paid" || row.dueDate > date) continue;
      const account = draft.accounts.find((a) => a.id === goal.accountId);
      if (account && account.balance >= row.payment) {
        postTxn(draft, goal, "loan_repayment", row.payment, date, `Trả nợ kỳ ${row.period}`);
        row.status = "paid";
        row.paidAt = date;
        if (summary) summary.instalmentsPaid += 1;
      } else if (row.status !== "overdue") {
        row.status = "overdue";
        if (summary) summary.instalmentsOverdue += 1;
      }
    }
    refreshLoanStatuses(loan, date);
  }
}

/**
 * Moves the simulated clock forward day by day. Per day, in order:
 * 1. lương về tài khoản chính (ngày lương) · 2. trích tự động (thiếu tiền → thất bại)
 * 3. lãi tháng cho tài khoản mục tiêu (ngày 1) · 4. giá quỹ theo chuỗi giá
 * 5. tiền gửi đáo hạn · 6. kỳ trả nợ (thiếu → quá hạn) · 7. chuyển trạng thái đến hạn.
 * Pure: returns a new state.
 */
export function advanceTime<S extends WorldState>(state: S, days: number): { state: S; summary: AdvanceSummary } {
  const draft = structuredClone(state);
  const summary: AdvanceSummary = {
    days,
    from: state.clock.today,
    to: state.clock.today,
    standingOrdersOk: 0,
    standingOrdersFailed: 0,
    interestTotal: 0,
    maturities: 0,
    instalmentsPaid: 0,
    instalmentsOverdue: 0,
    lifecycle: [],
  };
  let date = state.clock.today;
  for (let i = 0; i < Math.max(0, Math.floor(days)); i++) {
    date = addDays(date, 1);
    draft.clock.today = date;
    const dom = dayOfMonth(date);

    if (dom === draft.customer.salaryDay) applySalary(draft);

    for (const goal of draft.goals) {
      if (goal.status !== "accumulating" && goal.status !== "repaying") continue;
      const so = goal.standingOrder;
      if (!so || !so.active || so.nextRunDate > date) continue;
      const result = runStandingOrder(draft, goal.id, date);
      if (result === "ok") summary.standingOrdersOk += 1;
      if (result === "failed") summary.standingOrdersFailed += 1;
    }

    if (dom === 1) {
      for (const account of draft.accounts) {
        if (account.status !== "open" || account.balance <= 0) continue;
        const goal = findGoal(draft, account.goalId);
        if (!goal) continue;
        const interest = Math.round((account.balance * account.interestRatePa) / 100 / 12);
        if (interest > 0) {
          postTxn(draft, goal, "interest", interest, date, "Lãi không kỳ hạn tháng trước");
          summary.interestTotal += interest;
        }
      }
    }

    for (const asset of draft.assets) {
      if (asset.type !== "liquid" || asset.status !== "held") continue;
      if (asset.category === "term_deposit" && asset.maturityDate && asset.maturityDate <= date && asset.principal !== undefined) {
        asset.status = "matured";
        asset.value = asset.principal + depositAccrued(asset.principal, asset.ratePa ?? 0, asset.createdAt, asset.maturityDate);
        asset.valuationDate = asset.maturityDate;
        summary.maturities += 1;
      }
    }

    payDueInstalments(draft, date, summary);
    summary.lifecycle.push(...applyLifecycle(draft, date));
  }

  // Fund prices: snapshot the latest price on each holding.
  for (const asset of draft.assets) {
    if (asset.type !== "liquid" || asset.category !== "fund" || asset.status !== "held" || asset.units === undefined) continue;
    const product = getInvestProduct(asset.productId);
    if (product?.kind !== "fund") continue;
    asset.price = fundPriceAt(product, date, draft.market.fundPriceShiftPct);
    asset.value = Math.round(asset.units * asset.price);
    asset.valuationDate = date;
  }

  summary.to = date;
  return { state: draft, summary };
}

/** "Đã tua 1 tháng: trích tự động 1 lần, lãi 120,000 VND, …" */
export function describeAdvance(summary: AdvanceSummary): string {
  const span = summary.days % 30 === 0 && summary.days >= 30 ? formatMonths(summary.days / 30) : `${summary.days} ngày`;
  const parts: string[] = [];
  if (summary.standingOrdersOk) parts.push(`trích tự động ${summary.standingOrdersOk} lần`);
  if (summary.standingOrdersFailed) parts.push(`${summary.standingOrdersFailed} lần trích thất bại`);
  if (summary.interestTotal) parts.push(`lãi ${formatVnd(summary.interestTotal)}`);
  if (summary.maturities) parts.push(`${summary.maturities} khoản tiền gửi đáo hạn`);
  if (summary.instalmentsPaid) parts.push(`trả ${summary.instalmentsPaid} kỳ nợ`);
  if (summary.instalmentsOverdue) parts.push(`${summary.instalmentsOverdue} kỳ nợ quá hạn`);
  for (const e of summary.lifecycle) parts.push(e.message.replace(/[.!]$/, ""));
  return `Đã tua ${span}${parts.length ? `: ${parts.join("; ")}` : ""}.`;
}
