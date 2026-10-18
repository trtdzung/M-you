"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Sheet } from "@/components/primitives";
import type { SavingsGoalView } from "../../model/types";
import type { Caution, Plan } from "../../advisor/analysis-types";
import { cashflowSentence, verdictSentence } from "../../advisor/templates";
import { usePersonaCif } from "@/providers/context";
import { transferNow } from "@/lib/demo-clock";
import { applyAdjustment, toCurrentDraft } from "../../advisor/apply-adjustment";
import { adjustAck } from "../../advisor/templates";
import { coachGoal } from "../../client/goals-api";
import type { AnalyzeDraft } from "../../advisor/analysis-types";
import { useGoalAdvisor } from "../../client/hooks/use-goal-advisor";
import { useAdvisorNarration } from "../../client/hooks/use-advisor-narration";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import { formatGoalMoney } from "../shared/format-goal-money";
import { primaryButton, secondaryButton } from "../styles";
import { VerdictCard } from "./VerdictCard";
import { PlanCompare } from "./PlanCompare";
import { FollowUp } from "./FollowUp";

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
  const cif = usePersonaCif();
  const savedDraft: AnalyzeDraft = {
    name: goal.name, targetAmount: goal.targetAmount, targetDate: goal.targetDate,
    flexibility: goal.flexibility, openingAmount: goal.currentAmount,
  };
  const [draft, setDraft] = useState(savedDraft);
  const [adjustStatus, setAdjustStatus] = useState<"idle" | "busy" | "unclear" | "failed">("idle");
  const [ack, setAck] = useState("");
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  const advisor = useGoalAdvisor(eligible ? draft : null, `${goal.id}:${goal.updatedAt}:${goal.currentAmount}:${retry}`);
  const previewChanged = draft.targetAmount !== goal.targetAmount || draft.targetDate !== goal.targetDate || Object.keys(advisor.overrides).length > 0;
  const currentDraft: AnalyzeDraft = { ...draft, ...advisor.overrides };
  async function adjust(text: string) {
    if (!cif || adjustStatus === "busy") return;
    const request = ++sequence.current;
    setAdjustStatus("busy");
    setAck("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 20_000); });
    const response = await Promise.race([coachGoal(cif, { request: text, answers: [], currentDraft: toCurrentDraft(currentDraft, transferNow()) }), timeout]);
    clearTimeout(timer);
    if (request !== sequence.current) return;
    if (response?.ok && response.data.status === "adjust" && response.data.adjustment) {
      const adjustment = response.data.adjustment;
      if (adjustment.kind === "use_savings_amount") {
        setAck("Để dùng thêm tiền đã có, hãy ghi nhận khoản góp trước. Phần điều chỉnh này chỉ thay đổi kế hoạch, chưa tăng số đã tích lũy.");
        setAdjustStatus("idle");
        return;
      }
      const next = applyAdjustment(currentDraft, adjustment, transferNow());
      if (goal.flexibility === "fixed" && next.targetDate !== goal.targetDate) {
        setAck("Mục tiêu có hạn cố định. Bạn có thể chỉnh số tiền; để đổi thời hạn, hãy đổi loại mục tiêu trong Quản lý mục tiêu.");
        setAdjustStatus("idle");
        return;
      }
      setDraft(next);
      advisor.setOverrides({});
      setAck(`${adjustAck(adjustment)} Kế hoạch đang được tính lại; mục tiêu chưa được lưu thay đổi.`);
      setAdjustStatus("idle");
    } else setAdjustStatus(response?.ok && response.data.message_code === "adjust_unclear" ? "unclear" : "failed");
  }
  // Explanation only: no conversation or goal-collection request.
  const narration = useAdvisorNarration(null, goal.name, advisor.analysis);
  const analysis = advisor.analysis;
  if (!eligible) return null;
  const selected = advisor.view.analysis && advisor.selectedPlanId ? advisor.view.analysis.plans[advisor.selectedPlanId] : null;
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
      {previewChanged && <div className="rounded-xl bg-surface-tint p-3 text-sm leading-6"><p>Bạn đang thử một kế hoạch khác. Mục tiêu đã lưu chưa thay đổi.</p><button type="button" className={`${secondaryButton} mt-2`} onClick={() => { sequence.current++; setDraft(savedDraft); advisor.setOverrides({}); setAck(""); setAdjustStatus("idle"); }}>Về kế hoạch đã lưu</button></div>}
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
        <p className="text-xs leading-5 text-muted">Đánh giá riêng mục tiêu này, chưa trừ khoản góp cho các mục tiêu khác. Các mức cắt chi là gợi ý, chưa thay đổi hạn mức chi tiêu.</p>
        <PlanCompare
          draft={draft}
          view={advisor.view}
          overrides={advisor.overrides}
          onOverrides={advisor.setOverrides}
          selectedPlanId={advisor.selectedPlanId}
          onSelect={advisor.selectPlan}
          narration={narration}
        />
        <FollowUp draft={currentDraft} status={adjustStatus} onSubmit={(text) => void adjust(text)} />
        {ack && <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm leading-6 text-text">{ack}</p>}
        <p className="text-xs leading-5 text-muted">Thử điều chỉnh chỉ thay đổi bản xem trước. Số đã tích lũy và mục tiêu đã lưu được giữ nguyên cho đến khi bạn xác nhận.</p>
        <button type="button" className={secondaryButton} disabled={!selected || advisor.view.phase !== "ready" || adjustStatus === "busy"} onClick={() => { if (selected) { setError(""); setReview(selected); } }}>Xem điều chỉnh mục tiêu</button>

      </>}
      <Sheet open={!!review} title="Xem điều chỉnh mục tiêu" onClose={() => { if (!pending) setReview(null); }}>
        <div className="flex flex-col gap-4 text-sm leading-6">
          <p className="font-semibold">{goal.name}</p>
          <p>Số tiền: {money(goal.targetAmount)} → <strong>{money(review?.targetAmount ?? goal.targetAmount)}</strong></p>
          <p>Thời hạn: {goal.targetDate.split("-").reverse().join("/")} → <strong>{(review ?? goal).targetDate.split("-").reverse().join("/")}</strong></p>
          <p>Mức góp mỗi tháng: <strong>{money(reviewMonthly)}</strong></p>
          {review && review.cuts.length > 0 && <p>Gợi ý giảm chi {review.cuts[0].label}: <strong>{money(review.cuts[0].perMonth)}/tháng</strong>. {review.cutsCoverGap ? "Đủ bù phần thiếu theo dòng tiền hiện tại." : "Chưa đủ bù phần thiếu, cần thêm điều chỉnh."} Việc lưu kế hoạch không tự đổi hạn mức chi tiêu.</p>}
          <p className="text-muted">Mức góp tính từ số đã tích lũy hiện tại, chưa tính lãi hoặc các nguồn tiền bổ sung gợi ý. Bạn cần tự thực hiện và ghi nhận các khoản góp.</p>
          {error && <p role="alert" className="text-negative">{error}</p>}
          <button type="button" className={primaryButton} disabled={pending} onClick={apply}>{pending ? "Đang lưu…" : "Xác nhận điều chỉnh"}</button>
          <button type="button" className={secondaryButton} disabled={pending} onClick={() => setReview(null)}>Tiếp tục chỉnh</button>
        </div>
      </Sheet>
    </Card>
  );
}
