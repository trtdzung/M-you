"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { secondaryButton, primaryButton } from "../styles";
import { GOALS_COPY } from "../copy";
import { FlexibilityField } from "./fields/FlexibilityField";
import { GoalDateField } from "./fields/GoalDateField";
import { GoalNameField } from "./fields/GoalNameField";
import { MoneyField } from "./fields/MoneyField";
import type { GoalFormState } from "./use-goal-form";

/** Fields of the goal form; `slot` is where the feasibility card goes. */
export function GoalForm({ form, slot, compact = false }: { form: GoalFormState; slot?: ReactNode; compact?: boolean }) {
  const { values, errors, set } = form;
  const f = GOALS_COPY.form;
  const [extraOpen, setExtraOpen] = useState(false);
  const extras = (<div className="flex flex-col gap-4">
    <FlexibilityField value={values.flexibility} onChange={(v) => set("flexibility", v)} />
    {form.mode === "create" && <MoneyField label={f.openingAmount} hint={f.openingHint} value={values.openingAmount} onChange={(v) => set("openingAmount", v)} error={errors.openingAmount} />}
    <MoneyField label={f.monthlyContribution} hint={f.monthlyHint} value={values.monthlyContribution} onChange={(v) => set("monthlyContribution", v)} error={errors.monthlyContribution} />
  </div>);
  return (
    <div className={`flex flex-col gap-4 ${compact ? "[&_input]:text-[16px] [&_input]:min-w-0 [&_input]:w-full" : ""}`}>
      <GoalNameField value={values.name} onChange={(v) => set("name", v)} error={errors.name} />
      <MoneyField
        label={f.targetAmount}
        value={values.targetAmount}
        onChange={(v) => set("targetAmount", v)}
        error={errors.targetAmount}
      />
      <GoalDateField customCalendar={compact}
        value={values.targetDate}
        onChange={(v) => set("targetDate", v)}
        error={errors.targetDate}
      />
      {compact ? <>
        <button type="button" onClick={() => setExtraOpen(true)} className={`${secondaryButton} flex items-center justify-between rounded-xl text-left font-medium`}>
          Thông tin bổ sung <ChevronRight size={18} aria-hidden="true" />
        </button>
        {(errors.openingAmount || errors.monthlyContribution) && <p role="alert" className="text-sm text-negative">Kiểm tra số tiền trong thông tin bổ sung.</p>}
        {extraOpen && <Sheet title="Thông tin bổ sung" description="Điều chỉnh kế hoạch tích lũy của bạn." onClose={() => setExtraOpen(false)}>
          {extras}
          <button type="button" className={`${primaryButton} mt-5 w-full`} onClick={() => setExtraOpen(false)}>Xong</button>
        </Sheet>}
      </> : extras}
      {slot}
    </div>
  );
}
