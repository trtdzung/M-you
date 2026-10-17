"use client";

import { X } from "lucide-react";
import { useCategories } from "@/state/categories";

/**
 * Inline alert for a refused TAXONOMY write (U20) — a rename the server rejected,
 * a hide that hit a 500, a duplicate label. Mirrors `JarMutationErrorNotice` on
 * purpose: the two providers refuse for different reasons and carry their own
 * Vietnamese copy, so a screen that writes to both shows both notices rather than
 * folding them into one ambiguous message. Dismissible; also cleared by the next
 * successful write.
 *
 * Without it a refused rename would silently snap the field back with no reason —
 * the user would read it as the app losing their edit.
 */
export function CategoryMutationErrorNotice() {
  const { mutationError, clearMutationError } = useCategories();
  if (!mutationError) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-row border border-negative/40 bg-negative-soft/40 px-3 py-2">
      <p className="flex-1 text-sm text-negative">{mutationError}</p>
      <button
        type="button"
        onClick={clearMutationError}
        aria-label="Đóng thông báo lỗi danh mục"
        className="shrink-0 rounded-full p-1 text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
