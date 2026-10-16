"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Card, SectionHeader } from "@/components/primitives";
import type { CashflowResult } from "@/domain/engine";
import { formatVndUnit } from "@/lib/format";
import { EXPENSE_GRADIENT, INCOME_GRADIENT } from "@/lib/cashflow-colors";
import { cn } from "@/lib/cn";

/**
 * "Tổng quan thu chi" — two gradient bars comparing Tiền vào (xanh) and Chi tiêu
 * (cam) for the month, each with a month-over-month pill and its amount, plus the
 * net difference in the header. Every number is the deterministic engine's
 * `cashflow` (invariant #1); the net keeps its sign (never a false 0, #6). Money-
 * in is a single aggregate — there are no income categories. Bar heights use a
 * sqrt scale so a small bar stays readable; the pill + label carry the figures.
 */
export function CashflowOverviewCard({
  cashflow,
  prevCashflow,
}: {
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
}) {
  const max = Math.max(cashflow.expense, cashflow.income, 1);
  const hasPending = cashflow.pendingExpense > 0;

  return (
    <section aria-label="Tổng quan thu chi">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Tổng quan thu chi
            <Info size={15} className="text-muted" aria-hidden="true" />
          </span>
        }
        subtitle={
          hasPending
            ? `Chênh lệch: ${formatVndUnit(cashflow.net)} · Đang chờ: ${formatVndUnit(cashflow.pendingExpense)}`
            : `Chênh lệch: ${formatVndUnit(cashflow.net)}`
        }
      />
      <Card>
        <div className="flex items-end justify-center gap-10" style={{ height: 200 }}>
          <Bar
            label="Tiền vào"
            amount={cashflow.income}
            prev={prevCashflow.income}
            max={max}
            gradient={INCOME_GRADIENT}
          />
          <Bar
            label="Chi tiêu"
            amount={cashflow.expense}
            prev={prevCashflow.expense}
            max={max}
            gradient={EXPENSE_GRADIENT}
            goodWhenDown
          />
        </div>
      </Card>
    </section>
  );
}

function Bar({
  label,
  amount,
  prev,
  max,
  gradient,
  goodWhenDown = false,
}: {
  label: string;
  amount: number;
  prev: number;
  max: number;
  gradient: { from: string; to: string };
  goodWhenDown?: boolean;
}) {
  const heightPct = 18 + 82 * Math.sqrt(Math.min(amount, max) / max);

  return (
    <div className="flex h-full w-[38%] max-w-[130px] flex-col items-center justify-end gap-2">
      <div
        className="relative flex w-full flex-col items-center rounded-t-row pt-3 text-primary-fg"
        style={{
          height: `${heightPct}%`,
          // Floor the bar tall enough to always hold its pill + amount on the
          // colored surface. Without it, a tiny/zero bar collapses below the pill
          // and the white amount text spills onto the white card — invisible.
          minHeight: 76,
          backgroundImage: `linear-gradient(180deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
        }}
      >
        <MomPill current={amount} prev={prev} goodWhenDown={goodWhenDown} />
        <span className="mt-2 text-lg font-bold leading-none">{formatVndUnit(amount)}</span>
      </div>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

/** MoM delta pill shown on the bar; "—" base when there is no prior period. */
function MomPill({
  current,
  prev,
  goodWhenDown,
}: {
  current: number;
  prev: number;
  goodWhenDown: boolean;
}) {
  if (prev <= 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-black/15 px-2 py-0.5 text-xs font-semibold">
        <Minus size={12} /> mới
      </span>
    );
  }
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-black/15 px-2 py-0.5 text-xs font-semibold",
      )}
    >
      <Icon size={12} aria-hidden="true" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}
