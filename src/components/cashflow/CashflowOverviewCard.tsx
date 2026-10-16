"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Card, SectionHeader } from "@/components/primitives";
import type { CashflowResult } from "@/domain/engine";
import { formatVndUnit } from "@/lib/format";
import { EXPENSE_GRADIENT, INCOME_GRADIENT } from "@/lib/cashflow-colors";
import { cn } from "@/lib/cn";

/**
 * "Tổng quan thu chi" — two gradient bars comparing Chi tiêu (cam) and Thu nhập
 * (xanh) for the month, each with a month-over-month pill and its amount, plus
 * the net balance in the header. Every number is the deterministic engine's
 * `cashflow` (invariant #1); the net keeps its sign (never a false 0, #6). Bar
 * heights use a sqrt scale so a small bar stays readable next to a large one —
 * the pill + label carry the exact figures, the bar is only a glance.
 */
export function CashflowOverviewCard({
  cashflow,
  prevCashflow,
}: {
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
}) {
  const max = Math.max(cashflow.expense, cashflow.income, 1);

  return (
    <section aria-label="Tổng quan thu chi">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Tổng quan thu chi
            <Info size={15} className="text-muted" aria-hidden="true" />
          </span>
        }
        subtitle={`Khoản dư: ${formatVndUnit(cashflow.net)}`}
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
          <Bar
            label="Thu nhập"
            amount={cashflow.income}
            prev={prevCashflow.income}
            max={max}
            gradient={INCOME_GRADIENT}
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
