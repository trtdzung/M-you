import { INVEST_PRODUCTS, ONLINE_DEPOSIT, SAVINGS_FLEX } from "../data/products";
import type { WorldState } from "../model/state";
import type { Goal, ISODate, RiskLevel } from "../model/types";
import { addMonths, monthsLeft } from "./dates";
import { requiredMonthly } from "./feasibility";
import { depositAccrued, goalAccount } from "./value";

type World = Pick<WorldState, "accounts" | "assets" | "clock" | "market" | "customer" | "goals" | "loans">;

/** Below this, idle cash is not worth suggesting an investment. */
export const IDLE_CASH_MIN = 10_000_000;

/**
 * Cash kept in the goal account as a buffer: one month of required saving,
 * plus next loan instalment in phase 2. At least 2.000.000 VND.
 */
export function cashBuffer(world: World, goal: Goal): number {
  const loan = goal.loanId ? world.loans.find((l) => l.id === goal.loanId && l.status === "active") : undefined;
  return Math.max(2_000_000, requiredMonthly(world, goal) + (loan?.monthlyPayment ?? 0));
}

/** Tiền nhàn rỗi trong tài khoản mục tiêu có thể đem đầu tư (0 nếu dưới ngưỡng). */
export function idleCash(world: World, goal: Goal): number {
  if (goal.status !== "accumulating" && goal.status !== "repaying") return 0;
  const balance = goalAccount(world, goal)?.balance ?? 0;
  const idle = Math.floor((balance - cashBuffer(world, goal)) / 1_000_000) * 1_000_000;
  return idle >= IDLE_CASH_MIN ? idle : 0;
}

/** Số tiền có thể đầu tư: toàn bộ số dư tài khoản mục tiêu (không giữ lại khoản đệm). */
export function investableCash(world: World, goal: Goal): number {
  return Math.max(0, Math.floor(goalAccount(world, goal)?.balance ?? 0));
}

export type HorizonBand = "short" | "medium" | "long";

/** < 12 tháng: ngắn · 12–36: trung · > 36: dài. */
export function horizonBand(today: ISODate, targetDate: ISODate): HorizonBand {
  const m = monthsLeft(today, targetDate);
  if (m < 12) return "short";
  if (m <= 36) return "medium";
  return "long";
}

export interface InvestSuggestion {
  productId: string;
  /** Kỳ hạn gợi ý (tiền gửi). */
  termMonths?: number;
  ratePa?: number;
  riskLevel: RiskLevel;
  title: string;
  reason: string;
  /** Plain-language risk / liquidity note. */
  caution?: string;
  suggestedAmount: number;
  /** Ước tính giá trị khi đáo hạn (tiền gửi) — undefined cho quỹ. */
  estimatedAtMaturity?: number;
  maturityDate?: ISODate;
}

/**
 * Rules (MSB products only so the goal can track them):
 * - < 12 months left → tiết kiệm linh hoạt or a short deposit maturing before the date.
 * - 12–36 months → term deposit maturing before the target date.
 * - > 36 months → term deposit (MSB has no funds or bonds).
 */
export function investSuggestions(world: World, goal: Goal, amount = idleCash(world, goal)): InvestSuggestion[] {
  if (amount <= 0) return [];
  const today = world.clock.today;
  const months = monthsLeft(today, goal.targetDate);
  const band = horizonBand(today, goal.targetDate);
  const out: InvestSuggestion[] = [];

  const longestTermBefore = (maxMonths: number) =>
    [...ONLINE_DEPOSIT.terms].filter((t) => t.months <= maxMonths).sort((a, b) => b.months - a.months)[0];

  if (band === "short") {
    out.push({
      productId: SAVINGS_FLEX.id,
      ratePa: SAVINGS_FLEX.ratePa,
      riskLevel: "low",
      title: SAVINGS_FLEX.name,
      reason: "Còn dưới 1 năm, cần rút được ngay khi đến ngày mục tiêu.",
      suggestedAmount: amount,
    });
  }
  const term = longestTermBefore(band === "short" ? Math.max(1, months - 1) : Math.min(24, months - 1));
  if (term && term.months < months) {
    const maturityDate = addMonths(today, term.months);
    out.push({
      productId: ONLINE_DEPOSIT.id,
      termMonths: term.months,
      ratePa: term.ratePa,
      riskLevel: "low",
      title: `${ONLINE_DEPOSIT.name} ${term.months} tháng`,
      reason: `Đáo hạn ${maturityDate.split("-").reverse().join("/")}, trước ngày mục tiêu. Lãi cố định, không mất gốc.`,
      caution: "Rút trước hạn chỉ hưởng lãi không kỳ hạn.",
      suggestedAmount: amount,
      estimatedAtMaturity: amount + depositAccrued(amount, term.ratePa, today, maturityDate),
      maturityDate,
    });
  }
  // Luôn có ít nhất một lựa chọn, kể cả khi không có kỳ hạn nào đáo hạn trước ngày mục tiêu.
  if (out.length === 0) {
    out.push({
      productId: SAVINGS_FLEX.id,
      ratePa: SAVINGS_FLEX.ratePa,
      riskLevel: "low",
      title: SAVINGS_FLEX.name,
      reason: "Rút được bất cứ lúc nào, phù hợp khi bạn chưa chắc ngày cần tiền.",
      suggestedAmount: amount,
    });
  }
  return out;
}

export interface InvestOption extends InvestSuggestion {
  recommended: boolean;
  minRatePa?: number;
  maxRatePa?: number;
  maturesAfterTarget?: boolean;
}

/** Toàn bộ sản phẩm theo thứ tự danh mục để khách hàng tự chọn. */
export function investOptions(world: World, goal: Goal, amount = idleCash(world, goal)): InvestOption[] {
  if (amount <= 0) return [];
  const today = world.clock.today;
  const months = monthsLeft(today, goal.targetDate);
  const recommendation = investSuggestions(world, goal, amount)[0];

  return INVEST_PRODUCTS.map((product): InvestOption => {
    const base = {
      productId: product.id,
      riskLevel: "low" as const,
      title: product.name,
      reason: product.description,
      suggestedAmount: amount,
    };
    if (product.kind === "term_deposit") {
      const terms = [...product.terms].sort((a, b) => a.months - b.months);
      const beforeTarget = terms.filter((term) => term.months < months);
      // Giữ đúng kỳ hạn của gợi ý hiện tại khi sản phẩm được đề xuất.
      const recommendedTerm = recommendation?.productId === product.id
        ? terms.find((term) => term.months === recommendation.termMonths)
        : undefined;
      const term = recommendedTerm ?? beforeTarget[beforeTarget.length - 1] ?? terms[0];
      const maturityDate = addMonths(today, term.months);
      return {
        ...base,
        title: `${product.name} ${term.months} tháng`,
        termMonths: term.months,
        ratePa: term.ratePa,
        minRatePa: Math.min(...terms.map((t) => t.ratePa)),
        maxRatePa: Math.max(...terms.map((t) => t.ratePa)),
        maturityDate,
        maturesAfterTarget: beforeTarget.length === 0,
        caution: "Rút trước hạn chỉ hưởng lãi không kỳ hạn.",
        estimatedAtMaturity: amount + depositAccrued(amount, term.ratePa, today, maturityDate),
        recommended: recommendation?.productId === product.id && recommendation.termMonths === term.months,
      };
    }
    const ratePa = product.kind === "savings" ? product.ratePa : product.kind === "bond" ? product.couponPa : undefined;
    return {
      ...base,
      ratePa,
      minRatePa: ratePa,
      maxRatePa: ratePa,
      recommended: recommendation?.productId === product.id,
    };
  });
}
