"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Card, SectionHeader } from "@/components/primitives";
import type { CashflowResult } from "@/domain/engine";
import { formatVndUnit } from "@/lib/format";
import { EXPENSE_GRADIENT } from "@/lib/cashflow-colors";
import { cn } from "@/lib/cn";

/**
 * "Tổng quan chi tiêu" — a gradient bar for the month's Chi tiêu (cam) with a
 * month-over-month pill and its amount, plus pending expense in the header.
 * Every number is the deterministic engine's `cashflow` (invariant #1). Income
 * was removed — the app tracks spending only. Bar height uses a sqrt scale so a
 * small bar stays readable; the pill + label carry the exact figures.
 */
export function CashflowOverviewCard({
  cashflow,
  prevCashflow,
}: {
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
}) {
  const max = Math.max(cashflow.expense, prevCashflow.expense, 1);
  const hasPending = cashflow.pendingExpense > 0;

  return (
    <section aria-label="Tổng quan chi tiêu">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Tổng quan chi tiêu
            <Info size={15} className="text-muted" aria-hidden="true" />
          </span>
        }
        subtitle={hasPending ? `Đang chờ ghi nhận: ${formatVndUnit(cashflow.pendingExpense)}` : undefined}
      />
      <Card>
        <div className="flex items-end justify-center gap-10" style={{ height: 200 }}>
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
