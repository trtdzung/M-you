import { getInvestProduct } from "../data/products";
import type { WorldState } from "../model/state";
import type { Asset, FundProduct, Goal, GoalAccount, ISODate, LiquidAsset, ProgressState, ValueSource } from "../model/types";
import { daysBetween, isBefore } from "./dates";

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

/** 0–100+ (not clamped above, so early achievement can show 103%). */
export function progressPct(world: Pick<WorldState, "accounts" | "assets" | "clock" | "market">, goal: Goal): number {
  if (goal.targetAmount <= 0) return 0;
  return (goalValue(world, goal).total / goal.targetAmount) * 100;
}

/**
 * Compares actual value with the straight-line plan from createdAt → targetDate.
 * ratio ≥ 1.1 ahead · ≥ 0.95 on track · ≥ 0.8 slightly behind · else off track.
 */
export function progressState(world: Pick<WorldState, "accounts" | "assets" | "clock" | "market">, goal: Goal): ProgressState {
  const total = daysBetween(goal.createdAt, goal.targetDate);
  const elapsed = Math.min(total, Math.max(0, daysBetween(goal.createdAt, world.clock.today)));
  const value = goalValue(world, goal).total;
  if (value >= goal.targetAmount) return "ahead";
  if (total <= 0 || elapsed <= 0) return "on_track";
  const expected = goal.targetAmount * (elapsed / total);
  if (expected <= 0) return "on_track";
  const ratio = value / expected;
  if (ratio >= 1.1) return "ahead";
  if (ratio >= 0.95) return "on_track";
  if (ratio >= 0.8) return "slightly_behind";
  return "off_track";
}

/** Amount still missing today (≥ 0). */
export function remainingAmount(world: Pick<WorldState, "accounts" | "assets" | "clock" | "market">, goal: Goal): number {
  return Math.max(0, goal.targetAmount - goalValue(world, goal).total);
}

/** Fixed asset valuation older than 12 months needs a refresh. */
export function needsRevaluation(asset: Asset, today: ISODate): boolean {
  return asset.type === "fixed" && daysBetween(asset.valuationDate, today) > 365;
}
