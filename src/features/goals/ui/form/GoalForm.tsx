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
  return (
    <div className={`flex flex-col gap-4 ${compact ? "[&_input]:text-[16px] [&_input]:min-w-0 [&_input]:w-full" : ""}`}>
      <GoalNameField value={values.name} onChange={(v) => set("name", v)} error={errors.name} />
      <MoneyField
        label={f.targetAmount}
        value={values.targetAmount}
        onChange={(v) => set("targetAmount", v)}
        error={errors.targetAmount}
      />
      <GoalDateField
        value={values.targetDate}
        onChange={(v) => set("targetDate", v)}
        error={errors.targetDate}
      />
      <details open={compact ? (errors.openingAmount || errors.monthlyContribution ? true : undefined) : true} className={compact ? "rounded-xl border border-border p-3" : ""}>
      <summary hidden={!compact} className="cursor-pointer text-[14px] font-medium text-text">Thông tin bổ sung</summary>
      <div className="flex flex-col gap-4 pt-3">
      <FlexibilityField value={values.flexibility} onChange={(v) => set("flexibility", v)} />
      {form.mode === "create" && (
        <MoneyField
          label={f.openingAmount}
          hint={f.openingHint}
          value={values.openingAmount}
          onChange={(v) => set("openingAmount", v)}
          error={errors.openingAmount}
        />
      )}
      <MoneyField
        label={f.monthlyContribution}
        hint={f.monthlyHint}
        value={values.monthlyContribution}
        onChange={(v) => set("monthlyContribution", v)}
        error={errors.monthlyContribution}
      />
      </div>
      </details>
      {slot}
    </div>
  );
}
