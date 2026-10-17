"use client";

import { useState } from "react";
import type { CoachQuestion as Question } from "../../coach/contracts";
import { GOALS_COPY } from "../copy";
import { chip, input, secondaryButton } from "../styles";

/** One catalog question: quick-pick chips plus an optional free-text box. */
export function CoachQuestion({
  question,
  disabled,
  onAnswer,
}: {
  question: Question;
  disabled?: boolean;
  onAnswer: (value: string, source: "option" | "text") => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-text">{question.text}</p>
      {question.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((o) => (
            <button key={o.value} type="button" disabled={disabled} className={chip} onClick={() => onAnswer(o.value, "option")}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {question.allow_free_text && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(text.trim(), "text");
          }}
        >
          <input
            aria-label={GOALS_COPY.coach.answerLabel}
            className={`${input} min-w-0 flex-1`}
            value={text}
            maxLength={200}
            placeholder={GOALS_COPY.coach.freeTextPlaceholder}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={disabled || !text.trim()} className={secondaryButton}>
            {GOALS_COPY.coach.send}
          </button>
        </form>
      )}
    </div>
  );
}
