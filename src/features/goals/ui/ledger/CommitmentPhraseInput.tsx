"use client";

import { useId } from "react";
import { GOALS_COPY } from "../copy";
import { hint, input, label } from "../styles";

/** Case-insensitive, trimmed comparison of what the user typed against the phrase. */
export function phraseMatches(typed: string, phrase: string): boolean {
  return typed.trim().toLowerCase() === phrase.trim().toLowerCase();
}

export function CommitmentPhraseInput({
  phrase,
  value,
  onChange,
}: {
  phrase: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={label}>
        {GOALS_COPY.ledger.commitmentLabel}
      </label>
      <p className={`${hint} font-medium text-ink-soft`}>{phrase}</p>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className={input}
      />
    </div>
  );
}
