"use client";

import { formatVnd } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { formatISODate, totalInterest } from "../../../engine";
import { LOAN_ROW_LABEL } from "../../../model/labels";
import type { ScreenProps } from "../../../model/screens";
import type { LoanRowStatus } from "../../../model/types";
import { ScreenHeader, SummaryRows } from "../../shared";
import { card, screenPadding, warningBox } from "../../shared/styles";
import { NotFoundScreen, useLoanScreen } from "../loan/shared";

const CHIP_TONE: Record<LoanRowStatus, string> = {
  paid: "bg-positive-soft text-positive",
  due: "bg-warning-soft text-warning",
  overdue: "bg-negative-soft text-negative",
  upcoming: "bg-surface-muted text-muted",
};

/** Lịch trả nợ từng kỳ: ngày, gốc, lãi, trạng thái. */
export function RepaySchedule({ params }: ScreenProps) {
  const { goal, loan, nav } = useLoanScreen(params);
  if (!goal) return <NotFoundScreen title="Lịch trả nợ" onCta={() => nav.push("GoalList")} />;
  if (!loan) {
    return (
      <div className={screenPadding}>
        <ScreenHeader title="Lịch trả nợ" subtitle={goal.name} />
        <div className={warningBox}>Mục tiêu này chưa có khoản vay.</div>
      </div>
    );
  }

  const paid = loan.schedule.filter((r) => r.status === "paid").length;
  const remainingInterest = totalInterest(loan.schedule.filter((r) => r.status !== "paid"));
  const nextIndex = loan.schedule.findIndex((r) => r.status !== "paid");

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Lịch trả nợ" subtitle={goal.name} />
      <SummaryRows
        rows={[
          { label: "Đã trả", value: `${paid}/${loan.schedule.length} kỳ` },
          { label: "Lãi còn phải trả", value: remainingInterest, source: "msb" },
        ]}
      />
      <ul className="flex flex-col gap-2">
        {loan.schedule.map((row, index) => (
          <li
            key={row.period}
            className={cn(card, "flex flex-col gap-1.5 py-3", index === nextIndex && "ring-2 ring-primary/40", row.status === "overdue" && "ring-2 ring-negative/40")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-text">
                Kỳ {row.period} · {formatISODate(row.dueDate)}
              </span>
              <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", CHIP_TONE[row.status])}>
                {LOAN_ROW_LABEL[row.status]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[13px] leading-5">
              <span className="text-muted">
                Gốc
                <span className="block font-semibold tabular-nums text-text">{formatVnd(row.principal)}</span>
              </span>
              <span className="text-muted">
                Lãi
                <span className="block font-semibold tabular-nums text-text">{formatVnd(row.interest)}</span>
              </span>
              <span className="text-muted">
                Tổng
                <span className="block font-semibold tabular-nums text-text">{formatVnd(row.payment)}</span>
              </span>
            </div>
            {row.paidAt && <p className="text-[12px] leading-4 text-muted">Đã trả ngày {formatISODate(row.paidAt)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
