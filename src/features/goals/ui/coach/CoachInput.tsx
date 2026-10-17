"use client";

import { useState } from "react";
import { GOALS_COPY } from "../copy";
import { chip, input, primaryButton } from "../styles";

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
      <div className="mb-2 flex flex-wrap gap-2" aria-label="Mục tiêu gợi ý">
        {["Quỹ dự phòng", "Mua xe", "Du lịch"].map((goal) => (
          <button key={goal} type="button" disabled={disabled} className={chip} onClick={() => setText(`Tôi muốn tiết kiệm cho ${goal.toLowerCase()}`)}>{goal}</button>
        ))}
      </div>
      <label htmlFor="goal-coach-input" className="text-[14px] leading-5 text-muted">Bạn có thể nói theo cách của mình</label>
      <input
        id="goal-coach-input"
        aria-label={GOALS_COPY.coach.inputLabel}
        className={`${input} w-full text-[16px] leading-6`}
        value={text}
        maxLength={MAX}
        placeholder={GOALS_COPY.coach.placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" disabled={disabled || !text.trim()} className={`${primaryButton} text-[15px] leading-5`}>
        Trao đổi với M-You
      </button>
    </form>
  );
}
