"use client";

import type { ReactNode } from "react";
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
  const extras = (<div className="flex flex-col gap-4">
    <FlexibilityField value={values.flexibility} onChange={(v) => set("flexibility", v)} />
    {form.mode === "create" && <MoneyField label={f.openingAmount} hint={f.openingHint} value={values.openingAmount} onChange={(v) => set("openingAmount", v)} error={errors.openingAmount} />}
    <MoneyField label={f.monthlyContribution} hint={f.monthlyHint} value={values.monthlyContribution} onChange={(v) => set("monthlyContribution", v)} error={errors.monthlyContribution} />
  </div>);
  return (
    <div className={`flex flex-col gap-5 ${compact ? "[&_input]:min-w-0 [&_input]:w-full" : ""}`}>
      <GoalNameField value={values.name} onChange={(v) => set("name", v)} error={errors.name} />
      <MoneyField
        label={f.targetAmount}
        value={values.targetAmount}
        onChange={(v) => set("targetAmount", v)}
        error={errors.targetAmount}
      />
      <GoalDateField customCalendar
        value={values.targetDate}
        onChange={(v) => set("targetDate", v)}
        error={errors.targetDate}
      />
      {<section className="mt-1 rounded-2xl border border-border/60 bg-surface p-4">
        <h3 className="text-[16px] font-semibold text-text">Kế hoạch tích lũy</h3>
        <p className="mb-5 mt-1 text-[13px] leading-5 text-muted">Thông tin bổ sung · Bạn có thể để trống số tiền và bổ sung sau.</p>
        {extras}
      </section>}
      {slot}
    </div>
  );
}
