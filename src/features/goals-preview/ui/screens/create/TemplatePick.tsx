"use client";

import type { ScreenProps } from "../../../model/screens";
import { usePreview } from "../../../store/PreviewStore";
import { ScreenHeader } from "../../shared/ScreenHeader";
import { StepProgress } from "../../shared/StepProgress";
import { card, ring, screenPadding } from "../../shared/styles";
import { TEMPLATES, WIZARD_STEPS } from "./wizard";

/** Bước 1: chọn loại mục tiêu. */
export function TemplatePick(_props: ScreenProps) {
  const { nav } = usePreview();

  return (
    <div className={screenPadding}>
      <ScreenHeader title="Tạo mục tiêu" subtitle="Bạn muốn tiết kiệm cho điều gì?" />
      <StepProgress steps={WIZARD_STEPS} current={0} />
      <p className="text-xs leading-5 text-muted">Mỗi mục tiêu có một tài khoản riêng để tiền không bị lẫn.</p>

      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
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
              <span className="text-sm font-bold text-text">{t.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
