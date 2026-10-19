"use client";

import type { ReactNode } from "react";
import { formatVnd } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { getLoanProduct, loanProductFor } from "../../../data/products";
import { feasibility, goalValue, loanPurposeFor, MAX_DTI, quoteLoan, type LoanQuote } from "../../../engine";
import type { PreviewState } from "../../../model/state";
import { paramNumber, paramString, type ScreenParams } from "../../../model/screens";
import type { Goal, GoalAccount, Loan, LoanProduct } from "../../../model/types";
import { usePreview } from "../../../store/PreviewStore";
import { EmptyState, ScreenHeader } from "../../shared";

/** Resolves goal / account / loan from screen params (goalId, loanId). */
export function useLoanScreen(params: ScreenParams) {
  const preview = usePreview();
  const { state } = preview;
  const loanId = paramString(params, "loanId");
  const loanById = loanId ? state.loans.find((l) => l.id === loanId) : undefined;
  const goalId = paramString(params, "goalId") ?? loanById?.goalId;
  const goal: Goal | undefined = goalId ? state.goals.find((g) => g.id === goalId) : undefined;
  const account: GoalAccount | undefined = goal?.accountId ? state.accounts.find((a) => a.id === goal.accountId) : undefined;
  const loan: Loan | undefined = loanById ?? (goal?.loanId ? state.loans.find((l) => l.id === goal.loanId) : undefined);
  return { ...preview, goal, account, loan, today: state.clock.today };
}

export function NotFoundScreen({ title, onCta }: { title: string; onCta: () => void }) {
  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title={title} />
      <EmptyState title="Không tìm thấy mục tiêu" description="Mục tiêu này không còn trong dữ liệu mô phỏng." ctaLabel="Về danh sách" onCta={onCta} />
    </div>
  );
}

/** Amount still missing: at the target date when planning ahead, today once due. */
export function loanGap(state: PreviewState, goal: Goal, deposit = 0): number {
  // Draft goal: no account yet, the opening deposit comes from the wizard.
  if (goal.status === "draft") return Math.max(0, goal.targetAmount - deposit);
  const remaining = Math.max(0, goal.targetAmount - goalValue(state, goal).total);
  if (goal.status === "missed" || state.clock.today >= goal.targetDate) return remaining;
  const f = feasibility(state, goal);
  const projected = typeof f.gapAtTarget === "number" ? f.gapAtTarget : remaining;
  return projected > 0 ? projected : remaining;
}

export function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function productForGoal(goal: Goal): LoanProduct {
  return loanProductFor(loanPurposeFor(goal.template));
}

export function resolveProduct(goal: Goal, productId: string | undefined): LoanProduct {
  return getLoanProduct(productId) ?? productForGoal(goal);
}

export interface LoanProbe {
  product: LoanProduct;
  principal: number;
  termMonths: number;
  quote: LoanQuote;
  /** Gap fits the product range and affordability. */
  possible: boolean;
}

/** Default loan offer for the gap: product by template, amount = gap, default term. */
export function probeLoan(state: PreviewState, goal: Goal, termOverride?: number): LoanProbe {
  const product = productForGoal(goal);
  const gap = loanGap(state, goal);
  const principal = Math.max(product.minAmount, roundUp(gap, 1_000_000));
  const wanted = product.purpose === "house" ? 240 : product.purpose === "car" ? 60 : 36;
  const termMonths = Math.min(product.maxTermMonths, termOverride ?? wanted);
  const quote = quoteLoan(state, {
    productId: product.id,
    principal,
    ratePa: product.ratePa,
    termMonths,
    startDate: state.clock.today,
  });
  return { product, principal, termMonths, quote, possible: quote.affordability.allowed && principal <= product.maxAmount };
}

export function loanParamsFrom(params: ScreenParams, goal: Goal, state: PreviewState) {
  const product = resolveProduct(goal, paramString(params, "productId"));
  const deposit = paramNumber(params, "deposit") ?? 0;
  const gap = loanGap(state, goal, deposit);
  const principal = paramNumber(params, "amount") ?? Math.max(product.minAmount, roundUp(gap, 1_000_000));
  const wanted = product.purpose === "house" ? 240 : product.purpose === "car" ? 60 : 36;
  const termMonths = Math.min(product.maxTermMonths, paramNumber(params, "termMonths") ?? wanted);
  return { product, gap, principal, termMonths, deposit };
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export type DtiTone = "ok" | "warn" | "bad";

export function dtiTone(dti: number): DtiTone {
  if (dti > MAX_DTI) return "bad";
  if (dti > 0.32) return "warn";
  return "ok";
}

const DTI_BAR: Record<DtiTone, string> = { ok: "bg-positive", warn: "bg-warning", bad: "bg-negative" };
const DTI_TEXT: Record<DtiTone, string> = { ok: "text-positive", warn: "text-warning", bad: "text-negative" };

/** Gauge of (new instalment + existing debt) / income, with the 40% limit marked. */
export function DtiGauge({
  dti,
  newPayment,
  existingDebt,
  income,
}: {
  dti: number;
  newPayment: number;
  existingDebt: number;
  income: number;
}) {
  const tone = dtiTone(dti);
  const scale = 0.6;
  const fill = Math.min(100, (dti / scale) * 100);
  const limit = (MAX_DTI / scale) * 100;
  const label = tone === "ok" ? "An toàn" : tone === "warn" ? "Sát giới hạn" : "Vượt giới hạn";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text">Nghĩa vụ trả nợ / thu nhập</span>
        <span className={cn("text-sm font-bold tabular-nums", DTI_TEXT[tone])}>
          {pct(dti)} · {label}
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={60}
        aria-valuenow={Math.round(dti * 100)}
        aria-label={`Nghĩa vụ trả nợ ${pct(dti)} thu nhập, giới hạn 40%`}
        className="relative h-3 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={cn("absolute inset-y-0 left-0 transition-all", DTI_BAR[tone])} style={{ width: `${fill}%` }} />
        <div aria-hidden className="absolute inset-y-0 w-0.5 bg-text/70" style={{ left: `${limit}%` }} />
      </div>
      <p className="text-[12px] leading-4 text-muted">
        Khoản trả mới {formatVnd(newPayment)} + nợ đang trả {formatVnd(existingDebt)} trên thu nhập {formatVnd(income)}/tháng. Giới hạn của MSB là 40%.
      </p>
    </div>
  );
}

export function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title && <h2 className="text-[15px] font-semibold text-text">{title}</h2>}
      {children}
    </section>
  );
}

export const INDICATIVE_NOTE =
  "Lãi suất và khoản trả chỉ mang tính tham khảo, lãi suất thực tế do MSB quyết định khi duyệt hồ sơ.";
