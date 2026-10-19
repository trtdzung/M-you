"use client";

import { addMonths, daysBetween, formatISODate } from "../../engine/dates";
import type { Goal } from "../../model/types";
import { usePreview } from "../../store/PreviewStore";
import { Note, ToolSection, ButtonGrid, toolButton } from "./kit";

export function TimeTab({ goal }: { goal: Goal | undefined }) {
  const { state, dispatch } = usePreview();
  const today = state.clock.today;
  const advance = (days: number) => dispatch({ type: "advanceTime", days });

  const monthDays = (m: number) => daysBetween(today, addMonths(today, m));

  const loan = state.loans.find((l) => l.status === "active" && (!goal || l.goalId === goal.id)) ?? state.loans.find((l) => l.status === "active");
  const nextRow = loan?.schedule.find((r) => r.status !== "paid");
  const toInstalment = nextRow ? daysBetween(today, nextRow.dueDate) : 0;

  const toDue = goal ? daysBetween(today, goal.targetDate) : 0;

  const deposits = state.assets
    .filter((a) => a.type === "liquid" && a.status === "held" && a.maturityDate && (!goal || a.goalId === goal.id))
    .map((a) => (a.type === "liquid" && a.maturityDate ? { name: a.name, days: daysBetween(today, a.maturityDate) } : null))
    .filter((x): x is { name: string; days: number } => !!x && x.days > 0)
    .sort((a, b) => a.days - b.days);

  return (
    <div className="flex flex-col gap-4">
      <ToolSection title="Ngày mô phỏng">
        <p className="text-[22px] font-bold leading-7 text-text">{formatISODate(today)}</p>
        <Note>Ngày nhận lương: mùng {state.customer.salaryDay} hằng tháng. Mỗi lần tua sẽ hiện tóm tắt những gì đã xảy ra.</Note>
      </ToolSection>

      <ToolSection title="Tua nhanh">
        <ButtonGrid>
          <button type="button" className={toolButton} onClick={() => advance(1)}>+1 ngày</button>
          <button type="button" className={toolButton} onClick={() => advance(7)}>+1 tuần</button>
          <button type="button" className={toolButton} onClick={() => advance(monthDays(1))}>+1 tháng</button>
          <button type="button" className={toolButton} onClick={() => advance(monthDays(3))}>+3 tháng</button>
        </ButtonGrid>
      </ToolSection>

      <ToolSection title="Tua tới mốc" hint={goal ? `Theo mục tiêu: ${goal.name}` : "Chưa chọn mục tiêu"}>
        <div className="flex flex-col gap-2">
          <button type="button" className={toolButton} disabled={!nextRow || toInstalment <= 0} onClick={() => advance(toInstalment)}>
            {nextRow
              ? toInstalment > 0
                ? `Tới kỳ trả tiếp (${formatISODate(nextRow.dueDate)}, +${toInstalment} ngày)`
                : "Kỳ trả tiếp đã đến hạn"
              : "Tới kỳ trả tiếp (không có khoản vay)"}
          </button>
          <button type="button" className={toolButton} disabled={!goal || toDue <= 0} onClick={() => advance(toDue)}>
            {goal
              ? toDue > 0
                ? `Tới ngày đến hạn (${formatISODate(goal.targetDate)}, +${toDue} ngày)`
                : "Mục tiêu đã quá ngày đến hạn"
              : "Tới ngày đến hạn"}
          </button>
          <button type="button" className={toolButton} disabled={deposits.length === 0} onClick={() => advance(deposits[0].days)}>
            {deposits.length > 0 ? `Tới ngày đáo hạn tiền gửi (+${deposits[0].days} ngày)` : "Tới ngày đáo hạn tiền gửi (không có)"}
          </button>
        </div>
      </ToolSection>
    </div>
  );
}
