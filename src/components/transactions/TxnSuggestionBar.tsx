"use client";

/**
 * Inline pending-suggestion strip shown UNDER a transaction row (a sibling, not a
 * child — the row itself is a button, so nesting one would be invalid). Shows the
 * provenance badge + suggested label and a one-tap "Đồng ý" (Red Team #15). A
 * pending suggestion is "chưa được tính" until confirmed (invariant #6).
 */

import { Check } from "lucide-react";
import { categoryLabel } from "@/domain/models";
import type { Correction } from "@/state/corrections";
import { CategoryProvenanceBadge } from "./CategoryProvenanceBadge";

export function TxnSuggestionBar({
  correction,
  onAccept,
}: {
  correction: Correction;
  /** Confirm the suggested category (writes a user correction + memory). */
  onAccept: (categoryId: string) => void;
}) {
  if (correction.status !== "pending" || !correction.categoryId) return null;
  return (
    <div className="mb-1.5 ml-1 flex flex-wrap items-center gap-2">
      <CategoryProvenanceBadge correction={correction} />
      <span className="text-xs text-text">{categoryLabel(correction.categoryId)}</span>
      <button
        type="button"
        onClick={() => onAccept(correction.categoryId as string)}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary bg-surface px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Check size={12} aria-hidden /> Đồng ý
      </button>
    </div>
  );
}
