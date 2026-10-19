import type { ISODate, LoanScheduleRow } from "../model/types";
import { addMonths } from "./dates";

/** Ngưỡng nghĩa vụ trả nợ / thu nhập tối đa. */
export const MAX_DTI = 0.4;

/** Annuity (trả góp đều) monthly payment, rounded up to 1.000 VND. */
export function annuityPayment(principal: number, ratePa: number, termMonths: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = ratePa / 100 / 12;
  const raw = r === 0 ? principal / termMonths : (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return Math.ceil(raw / 1000) * 1000;
}

/**
 * Full repayment schedule. Row i is due `i` months after `startDate`.
 * The last row absorbs rounding so the balance ends at exactly 0.
 */
export function buildSchedule(
  principal: number,
  ratePa: number,
  termMonths: number,
  startDate: ISODate,
  firstPeriod = 1,
): LoanScheduleRow[] {
  const payment = annuityPayment(principal, ratePa, termMonths);
  const r = ratePa / 100 / 12;
  const rows: LoanScheduleRow[] = [];
  let remaining = principal;
  for (let i = 1; i <= termMonths; i++) {
    const interest = Math.round(remaining * r);
    let principalPart = payment - interest;
    if (i === termMonths || principalPart > remaining) principalPart = remaining;
    remaining -= principalPart;
    rows.push({
      period: firstPeriod + i - 1,
      dueDate: addMonths(startDate, i),
      principal: principalPart,
      interest,
      payment: principalPart + interest,
      remaining,
      status: "upcoming",
    });
    if (remaining <= 0) break;
  }
  return rows;
}

export function totalInterest(schedule: LoanScheduleRow[]): number {
  return schedule.reduce((sum, row) => sum + row.interest, 0);
}

export interface Affordability {
  /** (khoản trả mới + nợ hiện có) / thu nhập. */
  dti: number;
  allowed: boolean;
  /** Max new monthly payment that keeps DTI ≤ 40%. */
  maxMonthlyPayment: number;
  /** Max principal for the given rate/term at that payment. */
  maxPrincipal: number;
}

export function affordability(input: {
  monthlyPayment: number;
  monthlyIncome: number;
  existingDebtPayment: number;
  ratePa: number;
  termMonths: number;
}): Affordability {
  const { monthlyPayment, monthlyIncome, existingDebtPayment, ratePa, termMonths } = input;
  const dti = monthlyIncome > 0 ? (monthlyPayment + existingDebtPayment) / monthlyIncome : Infinity;
  const maxMonthlyPayment = Math.max(0, Math.floor(monthlyIncome * MAX_DTI - existingDebtPayment));
  const r = ratePa / 100 / 12;
  const maxPrincipal =
    termMonths <= 0
      ? 0
      : r === 0
        ? maxMonthlyPayment * termMonths
        : Math.floor((maxMonthlyPayment * (1 - Math.pow(1 + r, -termMonths))) / r / 1_000_000) * 1_000_000;
  return { dti, allowed: dti <= MAX_DTI, maxMonthlyPayment, maxPrincipal };
}

/** Dư nợ gốc hiện tại = gốc còn lại trước kỳ chưa trả đầu tiên. */
export function outstandingPrincipal(schedule: LoanScheduleRow[]): number {
  const next = schedule.find((r) => r.status !== "paid");
  return next ? next.remaining + next.principal : 0;
}
