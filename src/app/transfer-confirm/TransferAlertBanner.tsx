"use client";

import { TriangleAlert } from "lucide-react";
import { Emphasized, SourceLine } from "@/components/security/InterventionCopy";
import type { Intervention } from "@/lib/security/intervention-types";

/**
 * Yellow Scam Shield banner on the confirm screen (spec section 2: «Banner trong
 * màn xác nhận + 1 câu hỏi», «Bấm tiếp ngay»): the scenario's words, its one
 * question and its chips. The customer can still confirm right away.
 */
export function TransferAlertBanner({ intervention, onChoose }: { intervention: Intervention; onChoose: (choice: string) => void }) {
  const { copy } = intervention;
  return (
    <div role="status" data-testid="shield-banner" className="flex gap-3 rounded-[20px] bg-warning-soft p-4 text-sm leading-relaxed text-text">
      <TriangleAlert size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SourceLine intervention={intervention} />
        <p><Emphasized text={copy.message} emphasis={copy.emphasis} /></p>
        {copy.question && <p className="font-semibold">{copy.question}</p>}
        {copy.chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {copy.chips.map(chip => (
              <button key={chip} type="button" onClick={() => onChoose(chip)} className="rounded-full border border-warning bg-white px-3 py-1.5 text-xs font-semibold text-text">
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
