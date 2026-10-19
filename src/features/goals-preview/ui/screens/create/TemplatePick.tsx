"use client";

import { Trash2 } from "lucide-react";
import { formatVndCompact } from "@/features/goals-preview/format-money";
import { formatMonths } from "../../../engine/dates";
import type { ScreenProps } from "../../../model/screens";
import { TEMPLATE_LABEL } from "../../../model/labels";
import { usePreview } from "../../../store/PreviewStore";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { card, ghostButton, ring, screenPadding, stepTitle } from "../../shared/styles";
import { TEMPLATES, WIZARD_STEPS, suggestedTarget } from "./wizard";

/** Bước 1: chọn loại mục tiêu. */
export function TemplatePick(_props: ScreenProps) {
  const { state, nav, dispatch } = usePreview();
  const drafts = state.goals.filter((g) => g.status === "draft");

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Tạo mục tiêu" subtitle="Bạn muốn tiết kiệm cho điều gì?" />
      <StepProgress steps={WIZARD_STEPS} current={0} />
      <p className="text-[13px] leading-5 text-muted">Mỗi mục tiêu có một tài khoản riêng để tiền không bị lẫn.</p>

      {drafts.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Bản nháp đang dở">
          <h2 className={stepTitle}>Bản nháp đang dở</h2>
          {drafts.map((goal) => (
            <div key={goal.id} className={`${card} flex items-center gap-2 !p-2 pl-4`}>
              <button
                type="button"
                onClick={() => nav.push("GoalInfo", { template: goal.template, goalId: goal.id })}
                className={`flex min-h-12 flex-1 flex-col items-start justify-center rounded-xl text-left ${ring}`}
              >
                <span className="text-[15px] font-semibold text-text">{goal.name}</span>
                <span className="text-[13px] text-muted">
                  {TEMPLATE_LABEL[goal.template]} · {formatVndCompact(goal.targetAmount)} · Tiếp tục
                </span>
              </button>
              <button
                type="button"
                aria-label={`Xoá bản nháp ${goal.name}`}
                onClick={() => dispatch({ type: "discardDraftGoal", goalId: goal.id })}
                className={`${ghostButton} !text-negative`}
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const suggested = suggestedTarget(t, state.customer);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => nav.push("GoalInfo", { template: t.id })}
              className={`${card} flex min-h-[112px] flex-col items-start gap-2 text-left transition-colors hover:bg-surface-muted ${ring}`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
                <Icon size={24} strokeWidth={1.8} aria-hidden />
              </span>
              <span className="text-[16px] font-bold text-text">{t.title}</span>
              {t.id === "other" ? (
                <span className="text-[12px] leading-4 text-muted">{t.hint}</span>
              ) : (
                <span className="mt-auto text-[12px] leading-4 text-muted">
                  Gợi ý <span className="whitespace-nowrap font-semibold text-primary-strong">{formatVndCompact(suggested.amount)}</span>
                  {suggested.fromExpenses ? " = 6 tháng chi tiêu" : <> · <span className="whitespace-nowrap">{formatMonths(t.months)}</span></>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
