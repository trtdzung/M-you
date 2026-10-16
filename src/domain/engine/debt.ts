/**
 * Debt-repayment projection — a deterministic amortization what-if: "if I pay X
 * per month, when is this cleared and how much interest?". Engine owns the math;
 * the AI narrates. Missing principal/rate stays unknown (never 0). A payment that
 * doesn't cover monthly interest is flagged as never-amortizing.
 */

import type { Liability } from "@/domain/models";
import { addMonthsToKey, dateToMonthKey } from "./types";

const MAX_MONTHS = 600;

export interface DebtPoint {
  month: string;
  balance: number;
}

export type DebtStatus = "already_clear" | "payable" | "never" | "unknown";

export interface DebtProjection {
  liabilityId: string;
  liabilityName: string;
  status: DebtStatus;
  startingBalance: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  monthsToPayoff: number | null;
  payoffDate: string | null;
  totalInterest: number | null;
  series: DebtPoint[];
  assumptions: string[];
  warnings: string[];
}

export interface DebtSimInput {
  monthlyPayment?: number | null;
  asOf?: Date;
}

export function simulateDebtRepayment(liability: Liability, input: DebtSimInput = {}): DebtProjection {
  const asOf = input.asOf ?? new Date();
  const startKey = dateToMonthKey(asOf);
  const principal = liability.outstandingPrincipal;
  const rate = liability.interestRate;
  const payment = input.monthlyPayment ?? null;

  const base = {
    liabilityId: liability.id,
    liabilityName: liability.name,
    startingBalance: principal,
    interestRate: rate,
    monthlyPayment: payment,
    assumptions: [
      "Lãi tính trên dư nợ giảm dần theo tháng.",
      "Giả định trả đều mỗi tháng, lãi suất không đổi.",
    ],
    warnings: [] as string[],
  };

  // Required inputs missing → unknown. Do not assume 0.
  if (principal === null || rate === null || payment === null || payment <= 0) {
    return { ...base, status: "unknown", monthsToPayoff: null, payoffDate: null, totalInterest: null, series: [] };
  }

  if (principal <= 0) {
    return {
      ...base,
      status: "already_clear",
      monthsToPayoff: 0,
      payoffDate: startKey,
      totalInterest: 0,
      series: [{ month: startKey, balance: 0 }],
    };
  }

  const monthlyRate = rate / 12;
  const firstInterest = principal * monthlyRate;

  // Payment never covers the interest → balance never falls.
  if (monthlyRate > 0 && payment <= firstInterest) {
    return {
      ...base,
      status: "never",
      monthsToPayoff: null,
      payoffDate: null,
      totalInterest: null,
      series: [{ month: startKey, balance: principal }],
      warnings: ["Khoản trả hàng tháng không đủ bù lãi — dư nợ sẽ không giảm."],
    };
  }

  let balance = principal;
  let totalInterest = 0;
  const series: DebtPoint[] = [{ month: startKey, balance: Math.round(balance) }];
  let month = 0;
  while (balance > 0 && month < MAX_MONTHS) {
    month += 1;
    const interest = balance * monthlyRate;
    totalInterest += interest;
    balance = balance + interest - payment;
    if (balance < 0) balance = 0;
    series.push({ month: addMonthsToKey(startKey, month), balance: Math.round(balance) });
  }

  const cleared = balance <= 0;
  return {
    ...base,
    status: cleared ? "payable" : "never",
    monthsToPayoff: cleared ? month : null,
    payoffDate: cleared ? addMonthsToKey(startKey, month) : null,
    totalInterest: cleared ? Math.round(totalInterest) : null,
    series,
    warnings: cleared ? base.warnings : ["Vượt quá thời hạn mô phỏng — kiểm tra lại khoản trả."],
  };
}
