"use client";

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Emphasized, SourceLine } from "@/components/security/InterventionCopy";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import type { Intervention } from "@/lib/security/intervention-types";

/**
 * Yellow Scam Shield banner on the confirm screen. Collapsed to the scenario
 * title so the transfer stays readable; the spec wording, question and chips
 * open on tap. The customer can still confirm without opening it.
 */
export function TransferAlertBanner({ intervention, onChoose }: { intervention: Intervention; onChoose: (choice: string) => void }) {
  const { copy } = intervention;
  const [open, setOpen] = useState(false);
  const title = SCENARIO_COPY[intervention.scenario].situation;
  return (
    <div role="status" data-testid="shield-banner" className="shield-yellow-banner">
      <button type="button" className="shield-yellow-toggle" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <TriangleAlert size={20} className="shrink-0 text-warning" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown size={18} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-2 pl-8">
          {intervention.source === "agent" && <SourceLine intervention={intervention} />}
          <p><Emphasized text={copy.message} emphasis={copy.emphasis} /></p>
          {copy.question && <p className="font-semibold">{copy.question}</p>}
          {copy.chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {copy.chips.map(chip => (
                <button key={chip} type="button" onClick={() => onChoose(chip)} className="shield-action">
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
