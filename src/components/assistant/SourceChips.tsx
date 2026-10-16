"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

export interface SourceChip {
  name: string;
  sources: string[];
  period?: string;
}

/**
 * Provenance chips under an assistant message. Each number in the answer came
 * from a tool result; these chips show the source/period behind them. Tapping a
 * chip reveals the full source lines (period · source · freshness).
 */
export function SourceChips({ chips }: { chips: SourceChip[] }) {
  const [open, setOpen] = useState(false);
  if (chips.length === 0) return null;

  const allSources = chips.flatMap((c) => c.sources);

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-text"
        aria-expanded={open}
      >
        <FileText size={12} className="text-primary" />
        {chips.length} nguồn dữ liệu
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {allSources.map((s, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-muted">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
