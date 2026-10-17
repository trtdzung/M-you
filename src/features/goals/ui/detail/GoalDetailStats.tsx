import type { ReactNode } from "react";
import { Money, ProvenanceChip } from "@/components/primitives";
import { formatDate } from "@/lib/format";
import type { SavingsGoalView } from "../../model/types";
import { GOALS_COPY } from "../copy";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-right font-medium text-text">{children}</dd>
    </div>
  );
}

export function GoalDetailStats({ goal }: { goal: SavingsGoalView }) {
  const c = GOALS_COPY.detail;
  return (
    <dl className="divide-y divide-border">
      <Row label="Thời gian còn lại">{goal.feasibility.monthsLeft} tháng</Row>
      <Row label={c.deadline}>{formatDate(goal.targetDate)}</Row>
      <Row label={c.requiredMonthly}>
        <Money amount={goal.feasibility.requiredMonthly} />
        <ProvenanceChip source={goal.feasibility.source} />
      </Row>
      <Row label="Mốc kế hoạch hôm nay"><Money amount={goal.progress.expectedAmount} /></Row>
      <Row label="Dữ liệu tích lũy"><span>Bạn tự ghi nhận</span></Row>
    </dl>
  );
}
