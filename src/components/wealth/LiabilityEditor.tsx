"use client";

import { useState } from "react";
import type { Liability } from "@/domain/models";
import {
  LIABILITY_TYPES,
  LIABILITY_TYPE_LABEL,
  validateLiabilityInput,
  type LiabilityDraft,
  type LiabilityFields,
} from "@/domain/models/asset-liability-input";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/primitives";

const INPUT = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

function draftFrom(liability?: Liability): LiabilityDraft {
  return {
    name: liability?.name ?? "",
    type: liability?.type ?? "credit_card",
    balance: liability?.outstandingPrincipal != null ? String(liability.outstandingPrincipal) : "",
    rate: liability?.interestRate != null ? String(Math.round(liability.interestRate * 10000) / 100) : "",
    minimumPayment: liability?.minimumPayment != null ? String(liability.minimumPayment) : "",
    dueDate: liability?.dueDate ?? "",
    remainingTerm: liability?.remainingTerm != null ? String(liability.remainingTerm) : "",
  };
}

/**
 * Bottom-sheet form to add or edit a manual liability. Validation runs through
 * `validateLiabilityInput` (the sole gate) — the type is enum-checked and every
 * numeric field rejects NaN/negative/over-cap. An empty balance stays unknown,
 * never 0 (#6). No money movement — this only records a debt (#3).
 */
export function LiabilityEditor({
  liability,
  onSubmit,
  onClose,
}: {
  liability?: Liability;
  onSubmit: (fields: LiabilityFields) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LiabilityDraft>(() => draftFrom(liability));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(liability);

  function set<K extends keyof LiabilityDraft>(key: K, val: LiabilityDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function submit() {
    const result = validateLiabilityInput(draft);
    if (!result.ok || !result.value) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.value);
    onClose();
  }

  return (
    <Sheet title={editing ? "Sửa khoản nợ" : "Thêm khoản nợ"} onClose={onClose}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tên khoản nợ
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              className={cn(INPUT, errors.name && "border-negative")}
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
            {errors.name && <span className="text-negative">{errors.name}</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Loại
            <select
              value={draft.type}
              onChange={(e) => set("type", e.target.value as LiabilityDraft["type"])}
              className={INPUT}
            >
              {LIABILITY_TYPES.map((t) => (
                <option key={t} value={t}>{LIABILITY_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Dư nợ (VND) — để trống nếu chưa rõ
            <input
              inputMode="numeric"
              value={draft.balance}
              onChange={(e) => set("balance", e.target.value)}
              placeholder="Chưa xác định"
              className={cn(INPUT, errors.balance && "border-negative")}
              aria-invalid={Boolean(errors.balance)}
            />
            {errors.balance && <span className="text-negative">{errors.balance}</span>}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Lãi suất năm (%)
              <input
                inputMode="decimal"
                value={draft.rate}
                onChange={(e) => set("rate", e.target.value)}
                className={cn(INPUT, errors.rate && "border-negative")}
              />
              {errors.rate && <span className="text-negative">{errors.rate}</span>}
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Kỳ hạn còn lại (tháng)
              <input
                inputMode="numeric"
                value={draft.remainingTerm}
                onChange={(e) => set("remainingTerm", e.target.value)}
                className={cn(INPUT, errors.remainingTerm && "border-negative")}
              />
              {errors.remainingTerm && <span className="text-negative">{errors.remainingTerm}</span>}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Khoản trả tối thiểu (VND)
              <input
                inputMode="numeric"
                value={draft.minimumPayment}
                onChange={(e) => set("minimumPayment", e.target.value)}
                className={cn(INPUT, errors.minimumPayment && "border-negative")}
              />
              {errors.minimumPayment && <span className="text-negative">{errors.minimumPayment}</span>}
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Ngày đến hạn kế tiếp
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className={cn(INPUT, errors.dueDate && "border-negative")}
              />
              {errors.dueDate && <span className="text-negative">{errors.dueDate}</span>}
            </label>
          </div>

          <button
            type="submit"
            className="mt-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {editing ? "Lưu thay đổi" : "Thêm khoản nợ"}
          </button>
        </form>
    </Sheet>
  );
}
