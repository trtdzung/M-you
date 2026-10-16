"use client";

/**
 * Provenance badge for a category label (invariant #5). Derived ONLY from
 * `origin` + `status` — the raw confidence number is NEVER shown (a bank user
 * does not read "61%"; Red Team #15). A heuristic guess is labelled "Gợi ý tự
 * động", NEVER "AI gợi ý" (Red Team #9 — a local heuristic must not masquerade
 * as AI).
 *
 * A `pending` badge is visually distinct (dashed, muted) to signal "chưa được
 * tính" — the engine has not counted this suggestion yet (invariant #6).
 */

import { Sparkles, Wand2 } from "lucide-react";
import type { Correction } from "@/state/corrections";

export function CategoryProvenanceBadge({ correction }: { correction?: Correction }) {
  if (!correction?.categoryId) return null;
  const origin = correction.origin ?? "user";
  const pending = correction.status === "pending";

  if (pending && origin === "ai") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-warning/60 px-1.5 py-0.5 text-[10px] font-medium text-warning">
        <Sparkles size={10} aria-hidden /> AI gợi ý · chờ xác nhận
      </span>
    );
  }
  if (pending && origin === "heuristic") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
        <Wand2 size={10} aria-hidden /> Gợi ý tự động · chờ xác nhận
      </span>
    );
  }
  if (origin === "memory") {
    return <span className="text-[10px] font-medium text-muted">đã học từ bạn</span>;
  }
  if (origin === "ai" || origin === "heuristic") {
    return <span className="text-[10px] font-medium text-muted">đã gắn nhãn tự động</span>;
  }
  return null; // user origin: the Pencil marker elsewhere already conveys "đã sửa"
}
