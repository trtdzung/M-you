import { FUND_BOND, FUND_EQUITY, ONLINE_DEPOSIT, SAVINGS_FLEX } from "../data/products";
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
 * - > 36 months → term deposit, and a fund (bond fund; equity only for "growth" risk profile).
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
  if (band === "long") {
    out.push({
      productId: FUND_BOND.id,
      riskLevel: FUND_BOND.riskLevel,
      title: FUND_BOND.name,
      reason: "Còn trên 3 năm, có thể chấp nhận biến động nhỏ để lợi nhuận tốt hơn tiền gửi.",
      caution: "Giá chứng chỉ quỹ thay đổi hằng ngày, không cam kết lợi nhuận.",
      suggestedAmount: Math.floor(amount / 2 / 1_000_000) * 1_000_000 || amount,
    });
    if (world.customer.riskProfile === "growth") {
      out.push({
        productId: FUND_EQUITY.id,
        riskLevel: FUND_EQUITY.riskLevel,
        title: FUND_EQUITY.name,
        reason: "Khẩu vị tăng trưởng và thời gian dài giúp vượt qua các đợt giảm giá.",
        caution: "Có thể giảm 10–20% trong ngắn hạn. Chỉ nên dùng phần tiền chưa cần trong 3 năm.",
        suggestedAmount: Math.floor(amount / 3 / 1_000_000) * 1_000_000 || amount,
      });
    }
  }
  return out;
}
