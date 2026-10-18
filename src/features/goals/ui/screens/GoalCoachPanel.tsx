"use client";

import { useRef, useState } from "react";
import { MessageSquarePlus, MoreHorizontal, Sparkles } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { transferNow } from "@/lib/demo-clock";
import { useGoalCoach } from "../../client/hooks/use-goal-coach";
import { useAdvisorNarration } from "../../client/hooks/use-advisor-narration";
import { useGoalAdvisor } from "../../client/hooks/use-goal-advisor";
import { applyAdjustments, toCurrentDraft } from "../../advisor/apply-adjustment";
import { coachDraftToAnalyze } from "../../advisor/to-analyze-draft";
import { draftToForm } from "../../coach/to-form";
import { CoachFallback } from "../coach/CoachFallback";
import { CoachInput } from "../coach/CoachInput";
import { CoachOutOfScope } from "../coach/CoachOutOfScope";
import { CoachQuestion } from "../coach/CoachQuestion";
import { CoachTranscript } from "../coach/CoachTranscript";
import { GoalAdvisorCard } from "../advisor/GoalAdvisorCard";
import { GOALS_COPY } from "../copy";
import { primaryButton, secondaryButton } from "../styles";
import { ConfirmPlan } from "../advisor/ConfirmPlan";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import { CreateGoalFlow } from "./CreateGoalFlow";

/** Goal Coach on /goals: say a goal, answer a few chips, review the pre-filled form. */
export function GoalCoachPanel({ onCreated, active = true }: { onCreated: () => void; active?: boolean }) {
  const coach = useGoalCoach();
  // One working draft for everything on the card: the coach's draft plus the customer's edits by words.
  const baseDraft = coach.draft ? coachDraftToAnalyze(coach.draft, transferNow()) : null;
  const analyzeDraft = baseDraft ? applyAdjustments(baseDraft, coach.adjustments, transferNow()) : null;
  const draftKey = coach.requestId ? `${coach.requestId}:${coach.adjustments.length}` : null;
  const advisor = useGoalAdvisor(analyzeDraft, draftKey);
  const narration = useAdvisorNarration(analyzeDraft ? draftKey : null, analyzeDraft?.name ?? null, advisor.analysis, coach.conversationId);
  // The form opens with the plan the customer picked (its date/amount), not the raw draft.
  const chosenPlanId = advisor.selectedPlanId;
  const chosen = advisor.view.analysis && advisor.selectedPlanId ? advisor.view.analysis.plans[advisor.selectedPlanId] : null;
  const reviewPrefill = coach.draft
    ? chosen && analyzeDraft
      ? {
          ...draftToForm(coach.draft, transferNow()),
          targetAmount: String(chosen.targetAmount),
          targetDate: chosen.targetDate,
          openingAmount: analyzeDraft.openingAmount > 0 ? String(analyzeDraft.openingAmount) : "",
        }
      : draftToForm(coach.draft, transferNow())
    : null;
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const { create, pending: creating } = useGoalMutations();
  const [manual, setManual] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const busy = coach.phase === "asking" || coach.phase === "answering";
  const restart = () => {
    setReviewing(false);
    setConfirming(false);
    setConfirmError(null);
    setManual(false);
    setMenuOpen(false);
    setConfirmNew(false);
    setComposerKey(key => key + 1);
    coach.reset();
  };

  let body;
  if (coach.phase === "idle") body = null;
  else if (coach.phase === "out_of_scope") {
    body = (
      <div className="flex flex-col gap-3">
        <CoachTranscript turns={coach.turns} />
        <CoachOutOfScope reply={coach.reply} disabled={busy} onPick={coach.start} />
      </div>
    );
  }
  else if (coach.phase === "failed") {
    body = <CoachFallback request={coach.request} onManual={() => setManual(true)} onRetry={coach.retry} />;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <CoachTranscript turns={coach.turns} />
        {busy && <p role="status" className="flex items-center gap-2 rounded-2xl bg-surface p-4 text-sm text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />{GOALS_COPY.coach.thinking}</p>}
        {coach.question && (
          <CoachQuestion
            hideTextInput
            disabled={busy}
            key={coach.question.code + coach.answers.length}
            question={coach.question}
            onAnswer={(value, source) => coach.answer(coach.question!.slot, value, source)}
          />
        )}
        {coach.draft && <p className="text-sm text-text">{GOALS_COPY.coach.draftReady}</p>}
      </div>
    );
  }

  // Writes only on an explicit confirm; the idempotency key makes a second press harmless.
  async function confirmCreate() {
    if (!chosen || !chosenPlanId || !analyzeDraft || !coach.requestId) return;
    setConfirmError(null);
    const res = await create({
      name: analyzeDraft.name,
      targetAmount: chosen.targetAmount,
      targetDate: chosen.targetDate,
      flexibility: analyzeDraft.flexibility,
      monthlyContribution: chosen.monthly > 0 ? chosen.monthly : null,
      openingAmount: analyzeDraft.openingAmount > 0 ? analyzeDraft.openingAmount : null,
      requestKey: `coach:${coach.requestId}:${chosenPlanId}`,
    });
    if (!res) return;
    if (res.ok) done();
    else setConfirmError(res.error ?? Object.values(res.errors ?? {})[0] ?? "");
  }

  const done = () => {
    onCreated();
    restart();
  };
  return (
    <section className="flex flex-col gap-4 pb-44">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles size={18} aria-hidden="true" /></span>
        <div className="flex-1"><h2 className="text-[16px] leading-6 font-semibold text-text">M-You</h2><p className="text-[12px] leading-5 text-muted">Cùng bạn lập kế hoạch tích lũy</p></div>
        {coach.phase !== "idle" && <div className="relative" onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
        }} onKeyDown={event => {
          if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
        }}>
          <button ref={menuButton} type="button" aria-label="Tùy chọn trò chuyện" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><MoreHorizontal size={22} aria-hidden="true" /></button>
          {menuOpen && <div role="menu" aria-label="Tùy chọn trò chuyện" className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-card">
            <button autoFocus role="menuitem" type="button" className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-text hover:bg-surface-muted focus:bg-surface-muted focus:outline-none" onClick={() => { setMenuOpen(false); menuButton.current?.focus(); setConfirmNew(true); }}><MessageSquarePlus size={18} aria-hidden="true" />Cuộc trò chuyện mới</button>
          </div>}
        </div>}
      </div>
      {coach.phase === "idle" && <div className="rounded-2xl rounded-tl-sm border border-primary/10 bg-surface-tint p-5">
        <p className="text-[16px] leading-6 font-medium text-text">Bạn đang muốn dành tiền cho điều gì?</p>
        <p className="mt-2 text-[14px] leading-6 text-muted">Kể mình nghe, mình sẽ giúp bạn xác định số tiền và thời gian.</p>
      </div>}
      {body}
      <CoachInput
        key={composerKey}
        active={active}
        showSuggestions={coach.phase === "idle"}
        disabled={busy || coach.phase === "draft" || (coach.phase === "need_info" && !coach.question?.allow_free_text)}
        placeholder={busy ? "M-You đang trả lời…" : coach.phase === "draft" ? "Kiểm tra mục tiêu trước khi lưu" : coach.phase === "need_info" ? coach.question?.allow_free_text ? "Nhập câu trả lời của bạn…" : "Chọn một gợi ý ở trên" : "Kể M-You nghe mục tiêu của bạn…"}
        onSubmit={(text) => {
          if (["idle", "out_of_scope", "failed"].includes(coach.phase)) coach.start(text);
          else if (coach.question) coach.answer(coach.question.slot, text, "text");
        }}
      />
      {active && confirmNew && <Sheet title="Bắt đầu cuộc trò chuyện mới?" description="Nội dung trao đổi và mục tiêu chưa lưu sẽ bị bỏ. Mục tiêu đã lưu vẫn được giữ." onClose={() => setConfirmNew(false)}>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={restart} className={`${primaryButton} w-full`}>Bắt đầu mới</button>
          <button type="button" onClick={() => setConfirmNew(false)} className={secondaryButton}>Tiếp tục trò chuyện</button>
        </div>
      </Sheet>}
      {coach.draft && !reviewing && analyzeDraft && advisor.phase !== "failed" && (
        <GoalAdvisorCard
          draft={analyzeDraft}
          analysis={advisor.analysis}
          view={advisor.view}
          overrides={advisor.overrides}
          onOverrides={advisor.setOverrides}
          selectedPlanId={advisor.selectedPlanId}
          onSelectPlan={advisor.selectPlan}
          onReview={() => (chosenPlanId && chosen ? setConfirming(true) : setReviewing(true))}
          narration={narration}
          followUp={{ status: coach.adjustStatus, onSubmit: (text) => void coach.adjust(text, toCurrentDraft(analyzeDraft, transferNow())) }}
        />
      )}
      {coach.draft && !reviewing && (!analyzeDraft || advisor.phase === "failed") && <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-[18px] font-semibold text-text">Mục tiêu của bạn</h3>
        <p className="mt-3 break-words text-[16px] font-medium">{coach.draft.name}</p>
        <p className="mt-2 text-[24px] font-semibold tabular-nums">{coach.draft.target_amount.toLocaleString("en-US")} <span className="text-[13px] font-normal text-muted">VND</span></p>
        <p className="mt-2 text-[14px] text-muted">Hạn dự kiến: {draftToForm(coach.draft, transferNow()).targetDate.split("-").reverse().join("/") || "Cần bổ sung"}</p>
        <p className="mt-3 text-[13px] leading-5 text-muted">M-You đã điền thông tin từ cuộc trò chuyện. Bạn kiểm tra và chỉnh sửa trước khi lưu.</p>
        <button type="button" className={`${primaryButton} mt-4 w-full`} onClick={() => setReviewing(true)}>Kiểm tra và tạo mục tiêu</button>
      </section>}
      {confirming && chosen && analyzeDraft && (
        <ConfirmPlan
          values={{
            name: analyzeDraft.name,
            targetAmount: chosen.targetAmount,
            targetDate: chosen.targetDate,
            flexibility: analyzeDraft.flexibility,
            openingAmount: analyzeDraft.openingAmount,
            monthly: chosen.monthly,
            sourceHint: chosen.fundingFromJars[0]
              ? GOALS_COPY.advisor.confirm.jar(chosen.fundingFromJars[0].label)
              : chosen.fundingFromIdle > 0 ? GOALS_COPY.advisor.confirm.idle : null,
          }}
          pending={creating}
          error={confirmError}
          onConfirm={() => void confirmCreate()}
          onEdit={() => { setConfirming(false); setReviewing(true); }}
          onClose={() => setConfirming(false)}
        />
      )}
      {coach.draft && reviewPrefill && reviewing && (
        <CreateGoalFlow
          prefill={reviewPrefill}
          requestKey={coach.requestId ? `coach:${coach.requestId}` : undefined}
          onCreated={done}
          onClose={() => setReviewing(false)}
        />
      )}
      {manual && (
        <CreateGoalFlow suggestion={coach.request} onCreated={done} onClose={() => setManual(false)} />
      )}
    </section>
  );
}
