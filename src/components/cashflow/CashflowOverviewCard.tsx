"use client";

import { Card, Freshness, Money, SectionHeader } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import type { CashflowResult } from "@/domain/engine";

/**
 * "Tổng quan thu chi" — the month's income / expense / net at a glance. Every
 * number is the deterministic engine's `cashflow` (invariant #1), never invented:
 * missing values render "—" via `Money`, pending expense is kept separate from the
 * posted totals (#6), and the card carries its freshness so the origin is visible
 * (#5). The net's MoM delta compares against the prior period's net.
 */
export function CashflowOverviewCard({
  cashflow,
  prevCashflow,
}: {
  cashflow: CashflowResult;
  prevCashflow: CashflowResult;
}) {
  return (
    <section aria-label="Tổng quan thu chi">
      <SectionHeader title="Tổng quan thu chi" subtitle="Tháng này" />
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <SummaryCell label="Thu vào" amount={cashflow.income} tone="text-positive" />
          <SummaryCell label="Chi ra" amount={cashflow.expense} tone="text-text" />
          <SummaryCell
            label="Chênh lệch"
            amount={cashflow.net}
            tone={cashflow.net >= 0 ? "text-positive" : "text-negative"}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <DeltaBadge current={cashflow.net} previous={prevCashflow.net} />
          <Freshness at={cashflow.meta.freshness} className="text-[11px]" />
        </div>

        {cashflow.pendingExpense > 0 && (
          <p className="rounded-xl bg-warning-soft/70 px-3 py-2 text-xs text-text">
            Đang chờ ghi nhận: <Money amount={cashflow.pendingExpense} className="font-semibold" />, chưa tính vào tổng.
          </p>
        )}
      </Card>
    </section>
  );
}

function SummaryCell({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <Money amount={amount} className={`mt-1 block truncate text-sm font-bold ${tone}`} />
    </div>
  );
}
