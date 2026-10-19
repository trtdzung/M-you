import { loanProductFor } from "../data/products";
import type { WorldState } from "../model/state";
import type { Goal, GoalTemplate, ISODate, LoanPurpose } from "../model/types";
import { addMonths, monthsLeft } from "./dates";
import { affordability, annuityPayment, buildSchedule, totalInterest, type Affordability } from "./loan";
import { goalStage, goalValue } from "./value";

type World = Pick<WorldState, "accounts" | "assets" | "clock" | "market" | "customer" | "goals" | "loans">;

/** Goals that still compete for the monthly surplus. */
export function isSaving(goal: Goal): boolean {
  return goal.status === "accumulating" || goal.status === "repaying";
}

/**
 * Tiền cần để thêm mỗi tháng để đạt đúng hạn (không tính lãi cho đơn giản).
 * Phase 2: the instalment (gốc + lãi) — paying it every month reaches the stage target on time.
 */
export function requiredMonthly(world: World, goal: Goal): number {
  if (goal.status === "completed" || goal.status === "closed") return 0;
  const stage = goalStage(world, goal);
  const gap = Math.max(0, stage.target - stage.value);
  if (gap === 0) return 0;
  if (stage.phase === 2) return stage.loan?.monthlyPayment ?? 0;
  if (goal.status === "achieved") return 0;
  const months = monthsLeft(world.clock.today, stage.targetDate);
  return months === 0 ? gap : Math.ceil(gap / months / 1000) * 1000;
}

/**
 * Splits the shared monthly surplus across saving goals by priority (1 first).
 * Each goal takes min(required, what is left). "unknown" surplus → every goal "unknown".
 * Pass `extra` to include a goal being drafted (not yet in state).
 */
export function allocateSurplus(world: World, extra?: Goal): Record<string, number | "unknown"> {
  const surplus = world.customer.monthlySurplus;
  const goals = [...world.goals.filter(isSaving), ...(extra ? [extra] : [])].sort(
    (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
  );
  const result: Record<string, number | "unknown"> = {};
  if (surplus === "unknown") {
    for (const g of goals) result[g.id] = "unknown";
    return result;
  }
  // Instalments of goal loans (phase 2) come out of the surplus first.
  const loanPayments = world.loans.filter((l) => l.status === "active").reduce((sum, l) => sum + l.monthlyPayment, 0);
  let left = Math.max(0, surplus - loanPayments);
  for (const g of goals) {
    const need = requiredMonthly(world, g);
    // A phase-2 goal's need is its instalment, already reserved above.
    if (goalStage(world, g).phase === 2) {
      result[g.id] = 0;
      continue;
    }
    const take = Math.min(need, left);
    result[g.id] = take;
    left -= take;
  }
  return result;
}

export type FeasibilityStatus = "feasible" | "tight" | "infeasible" | "unknown" | "reached" | "not_applicable";

export interface Feasibility {
  status: FeasibilityStatus;
  monthsLeft: number;
  requiredMonthly: number;
  /** Phần số dư được chia cho mục tiêu này. */
  allocatedMonthly: number | "unknown";
  /** Giá trị dự kiến tại ngày mục tiêu. */
  projectedAtTarget: number | "unknown";
  /** Còn thiếu tại ngày mục tiêu (≥ 0). */
  gapAtTarget: number | "unknown";
  /** Share of the whole surplus this goal would use (0–1). */
  surplusShare: number | "unknown";
}

export function feasibility(world: World, goal: Goal, extra?: Goal): Feasibility {
  const stage = goalStage(world, goal);
  const value = stage.value;
  const target = stage.target;
  const months = monthsLeft(world.clock.today, stage.targetDate);
  const required = requiredMonthly(world, goal);
  // Phase 2: the instalment is reserved off the top of the surplus, not split with other goals.
  const allocation = stage.phase === 2 ? required : (allocateSurplus(world, extra)[goal.id] ?? 0);
  const surplus = world.customer.monthlySurplus;
  if (goal.status === "completed" || goal.status === "closed" || (goal.status === "achieved" && stage.phase === 1)) {
    return {
      status: "not_applicable",
      monthsLeft: months,
      requiredMonthly: 0,
      allocatedMonthly: 0,
      projectedAtTarget: value,
      gapAtTarget: 0,
      surplusShare: 0,
    };
  }
  if (value >= target) {
    return {
      status: "reached",
      monthsLeft: months,
      requiredMonthly: 0,
      allocatedMonthly: 0,
      projectedAtTarget: value,
      gapAtTarget: 0,
      surplusShare: 0,
    };
  }
  if (allocation === "unknown" || surplus === "unknown") {
    return {
      status: "unknown",
      monthsLeft: months,
      requiredMonthly: required,
      allocatedMonthly: "unknown",
      projectedAtTarget: "unknown",
      gapAtTarget: "unknown",
      surplusShare: "unknown",
    };
  }
  const projected = Math.min(stage.phase === 2 ? target : Infinity, value + allocation * months);
  const gap = Math.max(0, target - projected);
  const share = surplus > 0 ? required / surplus : 1;
  const status: FeasibilityStatus = gap > 0 ? "infeasible" : share > 0.7 ? "tight" : "feasible";
  return {
    status,
    monthsLeft: months,
    requiredMonthly: required,
    allocatedMonthly: allocation,
    projectedAtTarget: projected,
    gapAtTarget: gap,
    surplusShare: share,
  };
}

// ---------------------------------------------------------------- options

export function loanPurposeFor(template: GoalTemplate): LoanPurpose {
  if (template === "house") return "house";
  if (template === "car") return "car";
  return "consumer";
}

export interface LoanQuote {
  productId: string;
  principal: number;
  ratePa: number;
  termMonths: number;
  monthlyPayment: number;
  totalInterest: number;
  affordability: Affordability;
}

export function quoteLoan(
  world: Pick<WorldState, "customer">,
  input: { productId: string; principal: number; ratePa: number; termMonths: number; startDate: ISODate },
): LoanQuote {
  const monthlyPayment = annuityPayment(input.principal, input.ratePa, input.termMonths);
  const schedule = buildSchedule(input.principal, input.ratePa, input.termMonths, input.startDate);
  return {
    productId: input.productId,
    principal: input.principal,
    ratePa: input.ratePa,
    termMonths: input.termMonths,
    monthlyPayment,
    totalInterest: totalInterest(schedule),
    affordability: affordability({
      monthlyPayment,
      monthlyIncome: world.customer.monthlyIncome,
      existingDebtPayment: world.customer.existingDebtPayment,
      ratePa: input.ratePa,
      termMonths: input.termMonths,
    }),
  };
}

/** Default term for a goal loan: house 20 years, car 5 years, consumer 3 years (capped by product). */
export function defaultLoanTerm(purpose: LoanPurpose, maxTermMonths: number): number {
  const wanted = purpose === "house" ? 240 : purpose === "car" ? 60 : 36;
  return Math.min(wanted, maxTermMonths);
}

export interface GoalOptions {
  saveMore: { monthly: number; extraPerMonth: number; fitsSurplus: boolean | "unknown" } | null;
  extend: { newTargetDate: ISODate; extraMonths: number } | null;
  reduce: { newTargetAmount: number } | null;
  /** Last option. `null` when nothing is missing. */
  loan: LoanQuote | null;
}

/**
 * Ways to close the gap, in the order the UI should present them:
 * tiết kiệm thêm → lùi ngày → giảm mục tiêu → vay (cuối cùng).
 */
export function goalOptions(world: World, goal: Goal, extra?: Goal): GoalOptions {
  const f = feasibility(world, goal, extra);
  if (f.status === "reached" || f.status === "feasible" || f.status === "tight" || f.status === "not_applicable") {
    return { saveMore: null, extend: null, reduce: null, loan: null };
  }
  const value = goalValue(world, goal).total;
  const surplus = world.customer.monthlySurplus;
  const allocated = f.allocatedMonthly;

  const extraPerMonth = allocated === "unknown" ? f.requiredMonthly : Math.max(0, f.requiredMonthly - allocated);
  const saveMore = {
    monthly: f.requiredMonthly,
    extraPerMonth,
    fitsSurplus: surplus === "unknown" ? ("unknown" as const) : f.requiredMonthly <= surplus,
  };

  let extend: GoalOptions["extend"] = null;
  if (allocated !== "unknown" && allocated > 0) {
    const monthsNeeded = Math.ceil((goal.targetAmount - value) / allocated);
    const extraMonths = Math.max(1, monthsNeeded - f.monthsLeft);
    // Beyond 10 more years, lùi ngày is not a realistic option.
    if (extraMonths <= 120) extend = { newTargetDate: addMonths(goal.targetDate, extraMonths), extraMonths };
  }

  const reduce =
    f.projectedAtTarget === "unknown"
      ? null
      : { newTargetAmount: Math.floor(f.projectedAtTarget / 1_000_000) * 1_000_000 };

  const gap = f.gapAtTarget === "unknown" ? Math.max(0, goal.targetAmount - value) : f.gapAtTarget;
  const product = loanProductFor(loanPurposeFor(goal.template));
  const principal = Math.max(product.minAmount, Math.ceil(gap / 1_000_000) * 1_000_000);
  const loan = quoteLoan(world, {
    productId: product.id,
    principal,
    ratePa: product.ratePa,
    termMonths: defaultLoanTerm(product.purpose, product.maxTermMonths),
    startDate: goal.targetDate,
  });

  return { saveMore, extend, reduce, loan };
}
