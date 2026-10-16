"use client";

import { X } from "lucide-react";
import { useJarConfig } from "@/state/jars";

/**
 * Inline alert for a refused jar write (U20/S14/K02) — e.g. a role change that
 * hit a 500, or the server's 422 over-cap. Without it the UI silently stayed on
 * the old value. Dismissible; also cleared by the next successful write.
 */
export function JarMutationErrorNotice() {
  const { mutationError, clearMutationError } = useJarConfig();
  if (!mutationError) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-row border border-negative/40 bg-negative-soft/40 px-3 py-2">
      <p className="flex-1 text-sm text-negative">{mutationError}</p>
      <button
        type="button"
        onClick={clearMutationError}
        aria-label="Đóng thông báo lỗi"
        className="shrink-0 rounded-full p-1 text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
