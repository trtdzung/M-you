"use client";

import { useState } from "react";
import { Card, Sheet } from "@/components/primitives";
import type { SavingsGoalView } from "../../model/types";
import type { Caution, Plan } from "../../advisor/analysis-types";
import { cashflowSentence, verdictSentence } from "../../advisor/templates";
import { recommendedPlan } from "../../advisor/recommend";
import { useGoalAdvisor } from "../../client/hooks/use-goal-advisor";
import { useAdvisorNarration } from "../../client/hooks/use-advisor-narration";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import { formatGoalMoney } from "../shared/format-goal-money";
import { primaryButton, secondaryButton } from "../styles";
import { VerdictCard } from "./VerdictCard";
import { PlanCard } from "./PlanCard";

const money = (amount: number) => `${formatGoalMoney(amount)} VND`;
function cautionText(caution: Caution) {
  switch (caution.kind) {
    case "obligation_due": return `${caution.label} đến hạn trong ${caution.daysLeft} ngày${caution.amount === null ? "" : `: ${money(caution.amount)}`}. Hãy dành tiền cho khoản này trước.`;
    case "month_end_shortfall": return `Dòng tiền cuối tháng dự kiến ${money(caution.projected)}. Cần kiểm tra các khoản chi trước khi tăng tích lũy.`;
    case "tight_budget": return `Kế hoạch dùng khoảng ${Math.round(caution.shareOfSurplus * 100)}% phần dư mỗi tháng. Hãy giữ khoản dự phòng cho chi phí phát sinh.`;
  }
}

/** Assess an already saved goal; proposed changes require review and explicit confirmation. */
export function SavedGoalAssessment({ goal, onUpdated }: { goal: SavingsGoalView; onUpdated: () => void }) {
  const [retry, setRetry] = useState(0);
  const [review, setReview] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const { update, pending } = useGoalMutations();
  const eligible = goal.status !== "archived" && goal.currentAmount < goal.targetAmount;
  const advisor = useGoalAdvisor(eligible ? {
    name: goal.name, targetAmount: goal.targetAmount, targetDate: goal.targetDate,
    flexibility: goal.flexibility, openingAmount: goal.currentAmount,
  } : null, `${goal.id}:${goal.updatedAt}:${goal.currentAmount}:${retry}`);
  // Explanation only: no conversation or goal-collection request.
  const narration = useAdvisorNarration(null, goal.name, advisor.analysis);
  const analysis = advisor.analysis;
  if (!eligible) return null;
  const selected = analysis && advisor.selectedPlanId ? analysis.plans[advisor.selectedPlanId] : null;
  const cautions = analysis && advisor.selectedPlanId ? analysis.insights[advisor.selectedPlanId].cautions : [];
  const reviewMonthly = review ? Math.ceil(Math.max(0, review.targetAmount - goal.currentAmount) / Math.max(1, review.months)) : 0;
  async function apply() {
    if (!review || pending) return;
    const result = await update(goal.id, { targetAmount: review.targetAmount, targetDate: review.targetDate, monthlyContribution: reviewMonthly });
    if (result?.ok) { setReview(null); onUpdated(); }
    else setError(result && !result.ok ? result.error || "Chưa lưu được điều chỉnh. Vui lòng thử lại." : "Chưa lưu được điều chỉnh.");
  }
  return (
    <Card className="flex flex-col gap-4" as="section">
      <h2 className="text-base font-semibold text-text">Đánh giá của M-You</h2>
      {advisor.phase === "loading" && <p role="status" className="text-sm text-muted">Đang đánh giá mục tiêu và dòng tiền của bạn…</p>}
      {advisor.phase === "failed" && <div className="flex flex-col gap-3"><p role="alert" className="text-sm text-muted">Mục tiêu đã được lưu. Chưa tải được đánh giá.</p><button type="button" className={secondaryButton} onClick={() => setRetry(value => value + 1)}>Thử lại đánh giá</button></div>}
      {analysis && <>
        <VerdictCard analysis={analysis} narration={narration.verdict ?? verdictSentence(analysis)} />
        <p className="text-sm leading-6 text-muted">{cashflowSentence(analysis)}</p>
        {goal.monthlyContribution !== null && <p className="text-sm leading-6 text-text">Bạn dự định góp {money(goal.monthlyContribution)}/tháng. {goal.monthlyContribution < analysis.requiredMonthly ? `Để đạt đúng hạn, cần thêm khoảng ${money(analysis.requiredMonthly - goal.monthlyContribution)}/tháng.` : "Mức góp này đáp ứng số tiền cần tích lũy theo thời hạn hiện tại."}</p>}
        <div className="rounded-xl bg-surface-muted p-3 text-sm leading-6">
          <h3 className="font-semibold text-text">Bước tiếp theo</h3>
          <p className="text-muted">{analysis.verdict === "unknown" ? "Bổ sung dữ liệu thu chi để đánh giá khả năng tích lũy. " : ""}Dành khoảng {money(analysis.requiredMonthly)} mỗi tháng sau khi nhận thu nhập, rồi ghi nhận khoản góp để theo dõi tiến độ. Mức ước tính chưa tính lãi.</p>
        </div>
        {cautions.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-text">Điểm cần lưu ý</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted">{cautions.map((c, index) => <li key={index}>{cautionText(c)}</li>)}</ul></div>}
        <p className="text-xs leading-5 text-muted">Đánh giá riêng mục tiêu này, chưa trừ khoản góp cho các mục tiêu khác. Các nguồn tiền bổ sung trong phương án là gợi ý, chưa được ghi nhận vào tích lũy.</p>
        {analysis.verdict !== "unknown" && <>
          <h3 className="text-sm font-semibold text-text">Các hướng đạt mục tiêu</h3>
          <div role="radiogroup" aria-label="Phương án cho mục tiêu">
            {Object.values(analysis.plans).filter(plan => plan.available && (plan.id === "keep_deadline" || plan.needed)).map(plan => <div key={plan.id} className="mb-3 last:mb-0"><PlanCard plan={plan} selected={plan.id === advisor.selectedPlanId} recommended={plan.id === recommendedPlan(analysis)} onSelect={() => advisor.selectPlan(plan.id)} narration={narration.plans[plan.id]} /></div>)}
          </div>
          {selected && <button type="button" className={secondaryButton} onClick={() => { setError(""); setReview(selected); }}>Xem điều chỉnh mục tiêu</button>}
        </>}
      </>}
      {review && <Sheet title="Xem điều chỉnh mục tiêu" onClose={() => { if (!pending) setReview(null); }}>
        <div className="flex flex-col gap-4 text-sm leading-6">
          <p>Số tiền: {money(goal.targetAmount)} → <strong>{money(review.targetAmount)}</strong></p>
          <p>Thời hạn: {goal.targetDate.split("-").reverse().join("/")} → <strong>{review.targetDate.split("-").reverse().join("/")}</strong></p>
          <p>Mức góp mỗi tháng: <strong>{money(reviewMonthly)}</strong></p>
          <p className="text-muted">Mức góp tính từ số đã tích lũy hiện tại, chưa tính lãi hoặc các nguồn tiền bổ sung gợi ý. Bạn cần tự thực hiện và ghi nhận các khoản góp.</p>
          {error && <p role="alert" className="text-negative">{error}</p>}
          <button type="button" className={primaryButton} disabled={pending} onClick={apply}>{pending ? "Đang lưu…" : "Xác nhận điều chỉnh"}</button>
        </div>
      </Sheet>}
    </Card>
  );
}
