"use client";

import { useState } from "react";
import type { Asset } from "@/domain/models";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABEL,
  validateAssetInput,
  type AssetDraft,
  type AssetFields,
} from "@/domain/models/asset-liability-input";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/primitives";

const INPUT = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

function draftFrom(asset?: Asset): AssetDraft {
  return {
    name: asset?.name ?? "",
    type: asset?.type ?? "cash",
    value: asset?.value != null ? String(asset.value) : "",
    note: "",
  };
}

/**
 * Bottom-sheet form to add or edit a manual asset. Validation runs through
 * `validateAssetInput` (the sole gate) — an invalid entry is BLOCKED from
 * committing, so a NaN/negative/over-cap value can never reach the model. An
 * empty value is a genuinely-unknown valuation (kept null, never 0 — #6).
 */
export function AssetEditor({
  asset,
  onSubmit,
  onClose,
}: {
  asset?: Asset;
  onSubmit: (fields: AssetFields) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AssetDraft>(() => draftFrom(asset));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = Boolean(asset);

  function submit() {
    const result = validateAssetInput(draft);
    if (!result.ok || !result.value) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.value);
    onClose();
  }

  return (
    <Sheet title={editing ? "Sửa tài sản" : "Thêm tài sản"} onClose={onClose}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tên tài sản
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
            Loại
            <select
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as AssetDraft["type"] }))}
              className={INPUT}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>{ASSET_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Giá trị (VND) — để trống nếu chưa định giá
            <input
              inputMode="numeric"
              value={draft.value}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              placeholder="Chưa xác định"
              className={cn(INPUT, errors.value && "border-negative")}
              aria-invalid={Boolean(errors.value)}
            />
            {errors.value && <span className="text-negative">{errors.value}</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Ghi chú (tùy chọn)
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className={cn(INPUT, errors.note && "border-negative")}
            />
            {errors.note && <span className="text-negative">{errors.note}</span>}
          </label>

          <button
            type="submit"
            className="mt-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {editing ? "Lưu thay đổi" : "Thêm tài sản"}
          </button>
        </form>
    </Sheet>
  );
}
