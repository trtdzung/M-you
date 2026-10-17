"use client";

import { useState } from "react";
import { GOALS_COPY } from "../copy";
import { input, primaryButton } from "../styles";

const MAX = 500;

/** Sentence box + send button; keeps only its own text. */
export function CoachInput({ disabled, onSubmit }: { disabled?: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    if (text.trim()) onSubmit(text.trim());
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        aria-label={GOALS_COPY.coach.inputLabel}
        className={`${input} w-full`}
        value={text}
        maxLength={MAX}
        placeholder={GOALS_COPY.coach.placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" disabled={disabled || !text.trim()} className={primaryButton}>
        {GOALS_COPY.coach.send}
      </button>
    </form>
  );
}
