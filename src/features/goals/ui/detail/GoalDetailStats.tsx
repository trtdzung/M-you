import { formatDate } from "@/lib/format";
import type { SavingsGoalView } from "../../model/types";
import { formatGoalMoney } from "../shared/format-goal-money";

export function GoalDetailStats({ goal }: { goal: SavingsGoalView }) {
  return <section>
    <h2 className="text-[18px] font-semibold text-text">Kế hoạch của bạn</h2>
    <p className="mt-3 text-[13px] text-muted">Cần góp mỗi tháng</p>
    <p className="mt-1 text-[26px] leading-8 font-semibold tabular-nums text-text">{formatGoalMoney(goal.feasibility.requiredMonthly)} <span className="text-[13px] font-normal text-muted">VND/tháng</span></p>
    <p className="mt-3 text-[14px] leading-6 text-muted">Đến {formatDate(goal.targetDate)} · Còn {goal.feasibility.monthsLeft} tháng</p>
    <p className="mt-3 border-t border-border/60 pt-3 text-[12px] leading-5 text-muted">Ước tính từ số tiền bạn tự ghi nhận, tích lũy đều và chưa tính lãi.</p>
  </section>;
}
