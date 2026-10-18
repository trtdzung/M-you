"use client";

import { assessFeasibility } from "../../engine/feasibility";
import { parseVndInput } from "@/components/settings/parse-vnd-input";
import { transferNow } from "@/lib/demo-clock";
import { useState } from "react";
import { useGoalMutations } from "../../client/hooks/use-goal-mutations";
import type { GoalUpdateInput, SavingsGoalView } from "../../model/types";
import { GoalFormSheet } from "../form/GoalFormSheet";
import { useGoalForm } from "../form/use-goal-form";

/** Edit-goal sheet; unmounting it drops unsaved edits. */
export function EditGoalFlow({
  goal,
  onClose,
  onSaved,
  open = true,
}: {
  goal: SavingsGoalView;
  onClose: () => void;
  onSaved: () => void;
  open?: boolean;
}) {
  const form = useGoalForm(goal);
  const [formError, setFormError] = useState<string | null>(null);
  const { update, pending } = useGoalMutations();

  async function submit(input: unknown) {
    setFormError(null);
    const res = await update(goal.id, input as GoalUpdateInput);
    if (!res) return;
    if (res.ok) {
      onSaved();
      onClose();
      return;
    }
    if (res.errors) form.setErrors(res.errors);
    else setFormError(res.error ?? "");
  }

  const parsed = parseVndInput(form.values.targetAmount);
  const preview = parsed.kind === "ok" && parsed.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.values.targetDate)
    ? assessFeasibility({ targetAmount: parsed.value, currentAmount: goal.currentAmount, targetDate: form.values.targetDate, now: transferNow(), surplus: "unknown" }) : null;
  return (
    <GoalFormSheet
      open={open}
      form={form}
      slot={preview && <div className="rounded-2xl bg-surface-tint p-4"><h3 className="text-[16px] font-semibold">Kế hoạch sau thay đổi</h3><p className="mt-2 text-[14px] leading-6">Cần góp khoảng <strong>{preview.requiredMonthly.toLocaleString("en-US")} VND/tháng</strong> trong {preview.monthsLeft} tháng.</p><p className="mt-2 text-[12px] leading-5 text-muted">Ước tính từ số đã tích lũy hiện tại, chưa tính lãi. Lịch sử góp/rút được giữ nguyên.</p></div>}
      pending={pending}
      formError={formError}
      onSubmit={submit}
      onClose={onClose}
    />
  );
}
