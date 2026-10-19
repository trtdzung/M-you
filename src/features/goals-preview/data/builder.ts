import { addMonths, nextDayOfMonth } from "../engine/dates";
import { makeAccountNumber, nextId } from "../engine/ledger";
import { buildSchedule, annuityPayment } from "../engine/loan";
import { refreshLoanStatuses } from "../engine/lifecycle";
import { makeAsset, type FixedAssetSpec, type LiquidAssetSpec } from "../engine/assets";
import type { WorldState } from "../model/state";
import {
  TXN_DIRECTION,
  type CustomerProfile,
  type Goal,
  type GoalFlexibility,
  type GoalStatus,
  type GoalTemplate,
  type GoalTxnKind,
  type ISODate,
} from "../model/types";
import { getLoanProduct } from "./products";

export type { FixedAssetSpec, LiquidAssetSpec };

/**
 * Small DSL to build scenario worlds: the builder replays a goal's history
 * (opening deposit, monthly standing orders, monthly interest, investments,
 * loan repayments, extra txns) in date order so balances are consistent.
 */

export interface ExtraTxnSpec {
  kind: GoalTxnKind;
  /** "all" = the whole balance at that moment (e.g. paying for the car). */
  amount: number | "all";
  date: ISODate;
  note: string;
}

export interface LoanSpec {
  productId: string;
  principal: number;
  termMonths: number;
  disbursedAt: ISODate;
  /** Rows due on or before this date are recorded as paid from the goal account. */
  paidThrough?: ISODate;
}

export interface GoalSpec {
  name: string;
  template: GoalTemplate;
  target: number;
  createdAt: ISODate;
  targetDate: ISODate;
  priority?: number;
  flexibility?: GoalFlexibility;
  status?: GoalStatus;
  opening?: number;
  monthly?: number;
  dayOfMonth?: number;
  soActive?: boolean;
  /** Dates (yyyy-mm-dd) on which the standing order failed. */
  soFailedOn?: ISODate[];
  /** Standing orders stop being replayed after this date (default: today). */
  historyUntil?: ISODate;
  ratePa?: number;
  assets?: (FixedAssetSpec | LiquidAssetSpec)[];
  extraTxns?: ExtraTxnSpec[];
  loan?: LoanSpec;
  reachedEarlyAt?: ISODate;
  achievedAt?: ISODate;
  completedAt?: ISODate;
  closedAt?: ISODate;
  accountClosed?: boolean;
  originalTargetAmount?: number;
  originalTargetDate?: ISODate;
}

export const DEFAULT_CUSTOMER: CustomerProfile = {
  name: "Nguyễn Minh Anh",
  cif: "CIF0012345",
  monthlyIncome: 40_000_000,
  monthlySurplus: 15_000_000,
  monthlyExpenses: 25_000_000,
  existingDebtPayment: 0,
  mainCasaNumber: "03101012345678",
  mainCasaBalance: 35_000_000,
  salaryDay: 5,
  riskProfile: "balanced",
  dataMonths: 18,
};

export const SCENARIO_TODAY: ISODate = "2026-10-16";

interface PendingTxn {
  date: ISODate;
  order: number;
  kind: GoalTxnKind | "interest_calc";
  amount: number | "all";
  note: string;
  onPost?: (posted: number) => void;
}

export function buildWorld(input: {
  scenarioId: string;
  today?: ISODate;
  customer?: Partial<CustomerProfile>;
  goals: GoalSpec[];
  fundPriceShiftPct?: number;
}): WorldState {
  const today = input.today ?? SCENARIO_TODAY;
  const customer: CustomerProfile = { ...DEFAULT_CUSTOMER, ...input.customer };
  if (input.customer && input.customer.monthlyExpenses === undefined) {
    const surplus = customer.monthlySurplus === "unknown" ? Math.round(customer.monthlyIncome * 0.3) : customer.monthlySurplus;
    customer.monthlyExpenses = Math.max(0, customer.monthlyIncome - surplus - customer.existingDebtPayment);
  }
  const world: WorldState = {
    version: 1,
    scenarioId: input.scenarioId,
    customer,
    goals: [],
    accounts: [],
    txns: [],
    assets: [],
    loans: [],
    clock: { today },
    market: { fundPriceShiftPct: input.fundPriceShiftPct ?? 0 },
    seq: 1000,
  };
  input.goals.forEach((spec, index) => addGoal(world, spec, index + 1, today));
  return world;
}

function addGoal(world: WorldState, spec: GoalSpec, defaultPriority: number, today: ISODate): void {
  const goalId = nextId(world, "goal");
  const status = spec.status ?? "accumulating";
  const goal: Goal = {
    id: goalId,
    name: spec.name,
    template: spec.template,
    targetAmount: spec.target,
    targetDate: spec.targetDate,
    flexibility: spec.flexibility ?? "date_flexible",
    priority: spec.priority ?? defaultPriority,
    status,
    createdAt: spec.createdAt,
    reachedEarlyAt: spec.reachedEarlyAt,
    achievedAt: spec.achievedAt,
    completedAt: spec.completedAt,
    closedAt: spec.closedAt,
    originalTargetAmount: spec.originalTargetAmount,
    originalTargetDate: spec.originalTargetDate,
  };
  world.goals.push(goal);
  if (status === "draft") return;

  const accountId = nextId(world, "acc");
  goal.accountId = accountId;
  const account = {
    id: accountId,
    goalId,
    number: makeAccountNumber(world.seq),
    name: `TK mục tiêu – ${spec.name}`,
    balance: 0,
    interestRatePa: spec.ratePa ?? 0.5,
    openedAt: spec.createdAt,
    status: spec.accountClosed ? ("closed" as const) : ("open" as const),
  };
  world.accounts.push(account);

  const pending: PendingTxn[] = [];
  let order = 0;
  const push = (t: Omit<PendingTxn, "order">) => pending.push({ ...t, order: order++ });

  if (spec.opening) push({ date: spec.createdAt, kind: "deposit", amount: spec.opening, note: "Nạp tiền ban đầu" });

  const until = [spec.historyUntil ?? today, today, spec.completedAt ?? today, spec.closedAt ?? today].sort()[0];
  const day = spec.dayOfMonth ?? 10;
  if (spec.monthly) {
    let run = nextDayOfMonth(spec.createdAt, day);
    while (run <= until) {
      const failed = spec.soFailedOn?.includes(run);
      push({
        date: run,
        kind: failed ? "standing_order_failed" : "standing_order",
        amount: spec.monthly,
        note: failed ? "Tài khoản chính không đủ số dư" : `Trích tự động ngày ${day} hằng tháng`,
      });
      run = nextDayOfMonth(run, day);
    }
    const runs = pending.filter((p) => p.kind === "standing_order" || p.kind === "standing_order_failed");
    let failedCount = 0;
    for (let i = runs.length - 1; i >= 0 && runs[i].kind === "standing_order_failed"; i--) failedCount++;
    const last = runs[runs.length - 1];
    goal.standingOrder = {
      amount: spec.monthly,
      dayOfMonth: day,
      active: spec.soActive ?? (status === "accumulating" || status === "repaying"),
      nextRunDate: nextDayOfMonth(today, day),
      lastRunDate: last?.date,
      lastResult: last ? (last.kind === "standing_order_failed" ? "failed" : "ok") : undefined,
      failedCount,
    };
  }

  // Monthly interest on the 1st, from the month after opening until `until`.
  let interestDate = nextDayOfMonth(spec.createdAt, 1);
  while (interestDate <= until) {
    push({ date: interestDate, kind: "interest_calc", amount: 0, note: "Lãi không kỳ hạn tháng trước" });
    interestDate = addMonths(interestDate, 1);
  }

  for (const assetSpec of spec.assets ?? []) {
    const asset = makeAsset(world, goalId, assetSpec, spec.createdAt);
    world.assets.push(asset);
    if (assetSpec.type === "liquid") {
      push({ date: assetSpec.createdAt, kind: "invest", amount: assetSpec.amount, note: `Đầu tư: ${asset.name}` });
    }
  }

  if (spec.loan) {
    const product = getLoanProduct(spec.loan.productId);
    const ratePa = product?.ratePa ?? 10;
    const loanId = nextId(world, "loan");
    goal.loanId = loanId;
    const schedule = buildSchedule(spec.loan.principal, ratePa, spec.loan.termMonths, spec.loan.disbursedAt);
    const loan = {
      id: loanId,
      goalId,
      productId: spec.loan.productId,
      principal: spec.loan.principal,
      ratePa,
      termMonths: spec.loan.termMonths,
      disbursedAt: spec.loan.disbursedAt,
      monthlyPayment: annuityPayment(spec.loan.principal, ratePa, spec.loan.termMonths),
      schedule,
      prepaid: 0,
      status: "active" as const,
    };
    world.loans.push(loan);
    push({ date: spec.loan.disbursedAt, kind: "loan_disbursement", amount: spec.loan.principal, note: `Giải ngân ${product?.name ?? "khoản vay"}` });
    for (const row of schedule) {
      if (spec.loan.paidThrough && row.dueDate <= spec.loan.paidThrough) {
        row.status = "paid";
        row.paidAt = row.dueDate;
        push({ date: row.dueDate, kind: "loan_repayment", amount: row.payment, note: `Trả nợ kỳ ${row.period}` });
      } else if (row.dueDate <= today) {
        row.status = "overdue";
      }
    }
    refreshLoanStatuses(loan, today);
  }

  for (const extra of spec.extraTxns ?? []) push({ ...extra });

  // Replay in date order. Same date: keep insertion order (opening first).
  pending.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  for (const p of pending) {
    let kind = p.kind;
    let amount: number;
    if (kind === "interest_calc") {
      amount = Math.round((account.balance * account.interestRatePa) / 100 / 12);
      if (amount <= 0) continue;
      kind = "interest";
    } else {
      amount = p.amount === "all" ? account.balance : p.amount;
    }
    if (amount <= 0 && kind !== "standing_order_failed") continue;
    account.balance += TXN_DIRECTION[kind] * amount;
    world.txns.push({
      id: nextId(world, "txn"),
      goalId,
      accountId,
      kind,
      amount,
      date: p.date,
      note: p.note,
      balanceAfter: account.balance,
    });
  }
  if (status === "completed" || status === "closed") {
    goal.finalValue = world.txns.filter((t) => t.goalId === goalId).reduce((max, t) => Math.max(max, t.balanceAfter ?? 0), 0);
  }
}
