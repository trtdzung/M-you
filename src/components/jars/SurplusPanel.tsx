"use client";

import { useState } from "react";
import Link from "next/link";
import { PiggyBank, CheckCircle2 } from "lucide-react";
import { Card, Money, SourceBadge } from "@/components/primitives";
import { Empty } from "@/components/states";
import { useFinancials } from "@/state/useFinancials";
import { computeSurplus, simulateSurplusAllocation } from "@/domain/engine";
import { cn } from "@/lib/cn";

/**
 * Level 3 surplus allocation — a read-only what-if. Shows the month's surplus
 * (deterministic engine math, badged "estimated") and lets the user simulate
 * distributing it into savings goals with live projections. NO money movement,
 * NO draft: this only visualises numbers.
 *
 * Income unknown → surplus is UNKNOWN, never 0₫ (Security-F6): the panel nudges
 * the user to set income above instead of implying there is nothing to save.
 */
export function SurplusPanel() {
  const { financials, raw } = useFinancials();
  const [split, setSplit] = useState<Record<string, number>>({});

  if (!financials) {
    return (
      <Card>
        <p className="text-sm text-muted">Đang tải thặng dư…</p>
      </Card>
    );
  }

  const income = financials.jarIncomeBasis.value;
  const expense = financials.cashflow.expense;
  const surplus = computeSurplus(income, expense);
  const goals = raw?.goals ?? [];

  const plan = simulateSurplusAllocation({ surplus, goals, split });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <PiggyBank size={20} className="text-primary" />
        <span className="flex-1 font-bold text-text">Phân bổ thặng dư</span>
        <SourceBadge source="estimated" />
      </div>

      {surplus === "unknown" ? (
        <p className="text-sm text-muted">
          Chưa xác định thặng dư.{" "}
          <Link href="#" className="font-medium text-primary underline">
            Đặt thu nhập trước
          </Link>{" "}
          để mô phỏng phân bổ.
        </p>
      ) : surplus === 0 ? (
        <p className="text-sm text-muted">
          Chưa có thặng dư tháng này để phân bổ. Nếu chi đang vượt thu, xem lại các hũ chi tiêu phía trên.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Thặng dư tháng</span>
            <Money amount={surplus} className="text-lg font-bold text-text" />
          </div>

          {goals.length === 0 ? (
            <Empty title="Chưa có mục tiêu" description="Thêm mục tiêu tiết kiệm để phân bổ thặng dư." />
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {plan.targets.map((t) => {
                  const headroom = Math.max(0, t.targetAmount - t.currentAmount);
                  return (
                    <li key={t.goalId} className="rounded-2xl bg-surface-muted/40 p-3">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-text">
                          {t.goalName}
                          {t.reachesTarget && t.amount > 0 && (
                            <CheckCircle2 size={14} className="text-positive" />
                          )}
                        </span>
                        <Money amount={t.amount} className="font-semibold text-text" />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={headroom}
                        step={100_000}
                        value={Math.min(split[t.goalId] ?? 0, headroom)}
                        onChange={(e) => setSplit((s) => ({ ...s, [t.goalId]: Number(e.target.value) }))}
                        aria-label={`Phân bổ cho ${t.goalName}`}
                        className="w-full accent-primary"
                      />
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>
                          <Money amount={t.projectedAmount} className="text-text" /> / <Money amount={t.targetAmount} />
                        </span>
                        <span>{t.reachesTarget ? "Đạt mục tiêu" : "Đang tích lũy"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted">Còn lại chưa phân bổ</span>
                <Money
                  amount={plan.remaining}
                  className={cn("font-semibold", plan.remaining === 0 ? "text-muted" : "text-text")}
                />
              </div>
              <p className="text-[11px] text-muted">
                Chỉ là mô phỏng — không chuyển tiền, không tạo giao dịch.
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
