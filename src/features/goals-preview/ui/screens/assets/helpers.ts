import type { PreviewNav } from "../../../store/PreviewStore";
import { getInvestProduct } from "../../../data/products";
import { depositAccrued, assetValue, formatISODate, goalStage, goalValue, monthsBetween } from "../../../engine";
import type { PreviewState } from "../../../model/state";
import type { Goal, LiquidAsset } from "../../../model/types";

/** Local helpers for the assets + invest screens (T4). */

export function findGoal(state: PreviewState, goalId: string | undefined): Goal | undefined {
  return goalId ? state.goals.find((g) => g.id === goalId) : undefined;
}

export interface SaleQuote {
  gross: number;
  fee: number;
  net: number;
  early: boolean;
  /** Interest given up by settling a deposit early (VND). */
  lostInterest: number;
  note: string;
}

/** Mirrors the reducer's sale rules (full sale value; multiply by fraction for partial). */
export function quoteSale(state: PreviewState, asset: LiquidAsset): SaleQuote {
  const today = state.clock.today;
  const product = getInvestProduct(asset.productId);
  if (asset.category === "term_deposit" && asset.principal !== undefined && product?.kind === "term_deposit") {
    const early = asset.status === "held" && asset.maturityDate !== undefined && today < asset.maturityDate;
    if (early) {
      const gross = asset.principal + depositAccrued(asset.principal, product.earlyWithdrawRatePa, asset.createdAt, today);
      const normal = asset.principal + depositAccrued(asset.principal, asset.ratePa ?? 0, asset.createdAt, today);
      return {
        gross,
        fee: 0,
        net: gross,
        early: true,
        lostInterest: Math.max(0, normal - gross),
        note: `Tất toán trước hạn: chỉ hưởng lãi ${String(product.earlyWithdrawRatePa).replace(".", ",")}%/năm`,
      };
    }
  }
  const gross = assetValue(asset, state);
  if (asset.category === "fund" && product?.kind === "fund" && monthsBetween(asset.createdAt, today) < product.feeFreeAfterMonths) {
    const fee = Math.round((gross * product.sellFeePct) / 100);
    return { gross, fee, net: gross - fee, early: false, lostInterest: 0, note: `Phí bán ${String(product.sellFeePct).replace(".", ",")}% vì giữ dưới ${product.feeFreeAfterMonths} tháng` };
  }
  return { gross, fee: 0, net: gross, early: false, lostInterest: 0, note: "" };
}

/** Progress % of goal if its total value changes by `delta`. */
export function progressAfter(state: PreviewState, goal: Goal, delta: number): { before: number; after: number } {
  // Progress of the current phase (phase 2 = loan principal), matching the goal detail header.
  const stage = goalStage(state, goal);
  const t = stage.target || 1;
  return { before: (stage.value / t) * 100, after: (Math.max(0, stage.value + delta) / t) * 100 };
}

export function pct(value: number): string {
  return `${(Math.round(value * 10) / 10).toString().replace(".", ",")}%`;
}

export function dateVi(date: string | undefined): string {
  return formatISODate(date);
}

/** Back to the goal's detail screen on the "Tài sản" tab (replaces GoalDetail params so the tab sticks). */
export function backToGoalAssets(nav: PreviewNav, goalId: string): void {
  const idx = nav.stack.map((e) => e.screen).lastIndexOf("GoalDetail");
  if (idx < 0) {
    nav.replace("GoalDetail", { goalId, tab: "assets" });
    return;
  }
  const extra = nav.stack.length - 1 - idx;
  if (extra > 0) nav.pop(extra);
  nav.replace("GoalDetail", { goalId, tab: "assets" });
}
