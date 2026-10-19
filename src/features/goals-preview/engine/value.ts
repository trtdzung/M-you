import { getInvestProduct } from "../data/products";
import type { WorldState } from "../model/state";
import type { Asset, FundProduct, Goal, GoalAccount, ISODate, LiquidAsset, Loan, ProgressState, ValueSource } from "../model/types";
import { daysBetween, isBefore } from "./dates";
import { outstandingPrincipal } from "./loan";

// ---------------------------------------------------------------- prices

/** Daily fund price: linear interpolation of monthly anchors, then the manual shift. */
export function fundPriceAt(fund: FundProduct, date: ISODate, shiftPct = 0): number {
  const series = fund.priceSeries;
  if (series.length === 0) return 0;
  let price = series[series.length - 1].price;
  if (date <= series[0].date) price = series[0].price;
  else {
    for (let i = 1; i < series.length; i++) {
      if (date <= series[i].date) {
        const a = series[i - 1];
        const b = series[i];
        const span = daysBetween(a.date, b.date) || 1;
        const t = daysBetween(a.date, date) / span;
        price = a.price + (b.price - a.price) * t;
        break;
      }
    }
  }
  return Math.round(price * (1 + shiftPct / 100));
}

/** Simple interest accrued on a deposit from opening until `date` (capped at maturity). */
export function depositAccrued(principal: number, ratePa: number, from: ISODate, to: ISODate): number {
  const days = Math.max(0, daysBetween(from, to));
  return Math.round((principal * (ratePa / 100) * days) / 365);
}

/** Current market value of one asset (before countPercent). */
export function assetValue(asset: Asset, world: Pick<WorldState, "clock" | "market">): number {
  if (asset.status === "sold") return 0;
  if (asset.type === "fixed") return asset.value;
  return liquidValue(asset, world.clock.today, world.market.fundPriceShiftPct);
}

export function liquidValue(asset: LiquidAsset, today: ISODate, shiftPct: number): number {
  const product = getInvestProduct(asset.productId);
  if (asset.category === "fund" && product?.kind === "fund" && asset.units !== undefined) {
    return Math.round(asset.units * fundPriceAt(product, today, shiftPct));
  }
  if ((asset.category === "term_deposit" || asset.category === "savings") && asset.principal !== undefined) {
    const end = asset.maturityDate && isBefore(asset.maturityDate, today) ? asset.maturityDate : today;
    return asset.principal + depositAccrued(asset.principal, asset.ratePa ?? 0, asset.createdAt, end);
  }
  if (asset.category === "bond" && asset.units !== undefined && asset.price !== undefined) {
    return Math.round(asset.units * asset.price) + depositAccrued(asset.costBasis, asset.ratePa ?? 0, asset.createdAt, today);
  }
  return asset.value;
}

/** Unrealised gain/loss vs cost basis (VND). */
export function assetGain(asset: Asset, world: Pick<WorldState, "clock" | "market">): number {
  return assetValue(asset, world) - asset.costBasis;
}

// ---------------------------------------------------------------- goal value

export function goalAccount(world: Pick<WorldState, "accounts">, goal: Goal): GoalAccount | undefined {
  return goal.accountId ? world.accounts.find((a) => a.id === goal.accountId) : undefined;
}

export function goalAssets(world: Pick<WorldState, "assets">, goalId: string): Asset[] {
  return world.assets.filter((a) => a.goalId === goalId && a.status !== "sold");
}

export interface GoalValueBreakdown {
  /** Số dư tài khoản mục tiêu. */
  cash: number;
  /** Tài sản linh hoạt (theo giá hiện tại). */
  liquid: number;
  /** Phần tài sản cố định được tính vào mục tiêu. */
  fixedCounted: number;
  /** Toàn bộ giá trị tài sản cố định (chưa nhân %). */
  fixedTotal: number;
  /** Tài sản = liquid + fixedCounted. */
  assets: number;
  /** Giá trị mục tiêu = cash + assets. */
  total: number;
  /** Weakest provenance among the parts (self_reported if any fixed asset counts). */
  source: ValueSource;
}

export function goalValue(world: Pick<WorldState, "accounts" | "assets" | "clock" | "market">, goal: Goal): GoalValueBreakdown {
  const cash = goalAccount(world, goal)?.balance ?? 0;
  let liquid = 0;
  let fixedCounted = 0;
  let fixedTotal = 0;
  let source: ValueSource = "msb";
  for (const asset of goalAssets(world, goal.id)) {
    const value = assetValue(asset, world);
    if (asset.type === "liquid") {
      liquid += Math.round((value * asset.countPercent) / 100);
    } else {
      fixedTotal += value;
      const counted = Math.round((value * asset.countPercent) / 100);
      fixedCounted += counted;
      if (counted > 0) source = asset.source === "estimated" && source === "msb" ? "estimated" : "self_reported";
    }
  }
  const assets = liquid + fixedCounted;
  return { cash, liquid, fixedCounted, fixedTotal, assets, total: cash + assets, source };
}

type ValueWorld = Pick<WorldState, "accounts" | "assets" | "clock" | "market" | "loans">;

/**
 * The target the goal is currently working toward.
 * Phase 1: targetAmount by targetDate, value = cash + assets.
 * Phase 2 (vay để đạt mục tiêu): the loan principal by the last instalment date,
 * value = gốc đã trả + cash + assets — enough value means the loan can be settled.
 */
export interface GoalStage {
  phase: 1 | 2;
  target: number;
  startDate: ISODate;
  targetDate: ISODate;
  /** Gốc đã trả (phase 2 only, else 0). */
  principalPaid: number;
  /** Dư nợ gốc còn lại (phase 2 only, else 0). */
  outstanding: number;
  value: number;
  loan?: Loan;
}

export function goalLoan(world: Pick<WorldState, "loans">, goal: Goal): Loan | undefined {
  return goal.loanId ? world.loans.find((l) => l.id === goal.loanId) : undefined;
}

export function goalStage(world: ValueWorld, goal: Goal): GoalStage {
  const total = goalValue(world, goal).total;
  const loan = goalLoan(world, goal);
  if (loan && (goal.status === "achieved" || goal.status === "repaying")) {
    const outstanding = loan.status === "paid_off" ? 0 : outstandingPrincipal(loan.schedule);
    const principalPaid = Math.max(0, loan.principal - outstanding);
    const last = loan.schedule[loan.schedule.length - 1];
    return {
      phase: 2,
      target: loan.principal,
      startDate: loan.disbursedAt,
      targetDate: last?.dueDate ?? loan.disbursedAt,
      principalPaid,
      outstanding,
      value: principalPaid + total,
      loan,
    };
  }
  return { phase: 1, target: goal.targetAmount, startDate: goal.createdAt, targetDate: goal.targetDate, principalPaid: 0, outstanding: 0, value: total };
}

/** 0–100+ of the current stage (not clamped above, so early achievement can show 103%). */
export function progressPct(world: ValueWorld, goal: Goal): number {
  const stage = goalStage(world, goal);
  if (stage.target <= 0) return 0;
  return (stage.value / stage.target) * 100;
}

/**
 * Compares actual value with the plan of the current stage: phase 1 the straight
 * line createdAt → targetDate, phase 2 the principal the schedule has due by today.
 * ratio ≥ 1.1 ahead · ≥ 0.95 on track · ≥ 0.8 slightly behind · else off track.
 */
export function progressState(world: ValueWorld, goal: Goal): ProgressState {
  const stage = goalStage(world, goal);
  if (stage.value >= stage.target) return "ahead";
  let expected: number;
  if (stage.phase === 2 && stage.loan) {
    const today = world.clock.today;
    // An overdue instalment is a payment issue (shown on its own), not a progress issue:
    // progress counts cash already in the goal account.
    expected = stage.loan.prepaid + stage.loan.schedule.filter((r) => r.dueDate <= today).reduce((sum, r) => sum + r.principal, 0);
  } else {
    const total = daysBetween(stage.startDate, stage.targetDate);
    const elapsed = Math.min(total, Math.max(0, daysBetween(stage.startDate, world.clock.today)));
    if (total <= 0 || elapsed <= 0) return "on_track";
    expected = stage.target * (elapsed / total);
  }
  if (expected <= 0) return "on_track";
  const ratio = stage.value / expected;
  if (ratio >= 1.1) return "ahead";
  if (ratio >= 0.95) return "on_track";
  if (ratio >= 0.8) return "slightly_behind";
  return "off_track";
}

/** Amount of the current stage still missing today (≥ 0). */
export function remainingAmount(world: ValueWorld, goal: Goal): number {
  const stage = goalStage(world, goal);
  return Math.max(0, stage.target - stage.value);
}

/**
 * Phase-1 result for a goal that borrowed: what the customer saved on their own
 * (goal balance right before the disbursement) and the loan that closed the gap.
 */
export function phaseOneResult(world: Pick<WorldState, "txns" | "loans">, goal: Goal): { saved: number; borrowed: number; achievedAt: ISODate } | undefined {
  const loan = goalLoan(world, goal);
  if (!loan) return undefined;
  const txns = world.txns.filter((t) => t.goalId === goal.id);
  const idx = txns.findIndex((t) => t.kind === "loan_disbursement");
  const before = idx > 0 ? txns[idx - 1].balanceAfter : undefined;
  return {
    saved: before ?? Math.max(0, goal.targetAmount - loan.principal),
    borrowed: loan.principal,
    achievedAt: goal.achievedAt ?? loan.disbursedAt,
  };
}

/** Fixed asset valuation older than 12 months needs a refresh. */
export function needsRevaluation(asset: Asset, today: ISODate): boolean {
  return asset.type === "fixed" && daysBetween(asset.valuationDate, today) > 365;
}
