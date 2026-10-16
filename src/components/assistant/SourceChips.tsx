"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

export interface SourceChip {
  name: string;
  sources: string[];
  period?: string;
}

/**
 * Provenance pill under an assistant message. Each number in the answer came from
 * a tool result; this pill shows how many sources back it, and taps open the full
 * source lines (period · source · freshness). Styled with the neutral `source-mock`
 * provenance palette — prototype data is mock, so it is never dressed as
 * bank-verified (invariant: every number carries honest provenance).
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
        className="inline-flex items-center gap-1.5 rounded-full bg-source-mock-soft px-2.5 py-1 text-[11px] font-medium text-source-mock transition-opacity hover:opacity-80"
        aria-expanded={open}
      >
        <FileText size={12} />
        {chips.length} nguồn dữ liệu
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {allSources.map((s, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-muted">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-source-mock" />
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
