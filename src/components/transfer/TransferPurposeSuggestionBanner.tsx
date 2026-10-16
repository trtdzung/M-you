"use client";

import { Sparkles } from "lucide-react";
import { isSpendingPurpose, transferPurposeLabel } from "@/domain/models";
import type { TransferPurposeSuggestion } from "@/state/use-transfer-purpose-suggestion";

/**
 * The pending transfer-purpose suggestion card (presentational). It only ever
 * DISPLAYS a guess — accepting is the parent's mutation, gated on the user tap
 * (invariant #6). No confidence % is shown; origin is stated honestly ("AI đề
 * xuất" vs the local "Đề xuất tự động").
 */
export function TransferPurposeSuggestionBanner({
  suggestion,
  onAccept,
  onChooseOther,
}: {
  suggestion: TransferPurposeSuggestion;
  onAccept: () => void;
  onChooseOther: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-row border border-brand/30 bg-brand/5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <div className="flex-1">
          <p className="text-sm text-text">
            Gợi ý mục đích:{" "}
            <span className="font-semibold">{transferPurposeLabel(suggestion.purposeId)}</span>
          </p>
          <p className="text-[11px] text-muted">
            {suggestion.origin === "ai" ? "AI đề xuất" : "Đề xuất tự động"} · chờ bạn xác nhận
            {isSpendingPurpose(suggestion.purposeId) && " · tính vào chi tiêu"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="min-h-9 flex-1 rounded-row bg-brand px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Đồng ý
        </button>
        <button
          type="button"
          onClick={onChooseOther}
          className="min-h-9 flex-1 rounded-row border border-border bg-surface px-3 text-sm text-text transition-colors hover:bg-surface-muted"
        >
          Chọn khác
        </button>
      </div>
    </div>
  );
}
