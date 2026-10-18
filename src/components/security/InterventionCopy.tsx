"use client";

import type { ReactNode } from "react";
import type { Intervention } from "@/lib/security/intervention-types";

/** Spec bold phrases (`emphasis`) rendered as <strong> inside the message. */
export function Emphasized({ text, emphasis }: { text: string; emphasis: string[] }) {
  if (!emphasis.length) return <>{text}</>;
  const pattern = new RegExp(`(${emphasis.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return <>{text.split(pattern).map((part, i) => emphasis.includes(part) ? <strong key={i}>{part}</strong> : part)}</>;
}

/** Who wrote the words: the rule engine (spec wording) or the M-You agent. */
export function SourceLine({ intervention }: { intervention: Pick<Intervention, "source"> }) {
  return (
    <p className="text-xs font-semibold text-muted">
      {intervention.source === "agent" ? "M-You, trợ lý AI của MSB" : "Cảnh báo tự động"}
    </p>
  );
}

const chipClass = "rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary";

/** Message, question and chips of one intervention. */
export function InterventionBody({ intervention, onChoose, extra }: {
  intervention: Intervention;
  onChoose: (choice: string) => void;
  extra?: ReactNode;
}) {
  const { copy } = intervention;
  return (
    <div className="flex flex-col gap-2">
      <SourceLine intervention={intervention} />
      {copy.message && <p className="whitespace-pre-line text-sm leading-relaxed"><Emphasized text={copy.message} emphasis={copy.emphasis} /></p>}
      {copy.question && <p className="text-sm font-semibold leading-relaxed">{copy.question}</p>}
      {copy.chips.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {copy.chips.map(chip => <button key={chip} type="button" className={chipClass} onClick={() => onChoose(chip)}>{chip}</button>)}
        </div>
      )}
      {extra}
    </div>
  );
}
