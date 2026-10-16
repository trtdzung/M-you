// DEFERRED: unmounted in the 3-tab reformat — engine/tests kept, UI re-enabled
// later. See plans/260909-2254-pfm-3tab-reformat/ and plans/project-backlog.md.
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { GoalRecord } from "@/domain/models/goal-input";
import {
  validateGoalInput,
  type GoalDraft,
  type GoalFields,
} from "@/domain/models/goal-input";
import { cn } from "@/lib/cn";

const INPUT =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

function draftFrom(goal?: GoalRecord): GoalDraft {
  return {
    name: goal?.name ?? "",
    targetAmount: goal?.targetAmount != null ? String(goal.targetAmount) : "",
    targetDate: goal?.targetDate ?? "",
    monthlyContribution: goal?.monthlyContribution != null ? String(goal.monthlyContribution) : "",
  };
}

/**
 * Bottom-sheet form to add or edit a savings goal. Validation runs through
 * `validateGoalInput` (the sole gate) — a blank/NaN/negative target amount or an
 * invalid date can never reach the model. An empty monthly contribution is a
 * genuinely-unset plan (kept null, never 0 — #6). No money movement (#3).
 */
export function GoalEditor({
  goal,
  onSubmit,
  onClose,
}: {
  goal?: GoalRecord;
  onSubmit: (fields: GoalFields) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GoalDraft>(() => draftFrom(goal));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(goal);

  function submit() {
    const result = validateGoalInput(draft);
    if (!result.ok || !result.value) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.value);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Sửa mục tiêu" : "Thêm mục tiêu"}
    >
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-device-width overflow-y-auto rounded-t-2xl bg-surface p-4 pb-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-text">{editing ? "Sửa mục tiêu" : "Thêm mục tiêu"}</p>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-muted hover:bg-surface-muted">
            <X size={18} />
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tên mục tiêu
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className={cn(INPUT, errors.name && "border-negative")}
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
            {errors.name && <span className="text-negative">{errors.name}</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Số tiền mục tiêu (VND)
            <input
              inputMode="numeric"
              value={draft.targetAmount}
              onChange={(e) => setDraft((d) => ({ ...d, targetAmount: e.target.value }))}
              placeholder="Ví dụ 100000000"
              className={cn(INPUT, errors.targetAmount && "border-negative")}
              aria-invalid={Boolean(errors.targetAmount)}
            />
            {errors.targetAmount && <span className="text-negative">{errors.targetAmount}</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Ngày mục tiêu (tùy chọn)
            <input
              type="date"
              value={draft.targetDate}
              onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))}
              className={cn(INPUT, errors.targetDate && "border-negative")}
              aria-invalid={Boolean(errors.targetDate)}
            />
            {errors.targetDate && <span className="text-negative">{errors.targetDate}</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Đóng góp mỗi tháng (VND) — để trống nếu chưa rõ
            <input
              inputMode="numeric"
              value={draft.monthlyContribution}
              onChange={(e) => setDraft((d) => ({ ...d, monthlyContribution: e.target.value }))}
              placeholder="Chưa xác định"
              className={cn(INPUT, errors.monthlyContribution && "border-negative")}
              aria-invalid={Boolean(errors.monthlyContribution)}
            />
            {errors.monthlyContribution && <span className="text-negative">{errors.monthlyContribution}</span>}
          </label>

          <button
            type="submit"
            className="mt-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {editing ? "Lưu thay đổi" : "Thêm mục tiêu"}
          </button>
        </form>
      </div>
    </div>
  );
}
