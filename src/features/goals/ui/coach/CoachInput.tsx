"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp } from "lucide-react";
import { GOALS_COPY } from "../copy";
import { chip } from "../styles";

const MAX = 500;

export function CoachInput({ disabled, active = true, showSuggestions = true, placeholder = "Kể M-You nghe mục tiêu của bạn…", onSubmit }: { disabled?: boolean; active?: boolean; showSuggestions?: boolean; placeholder?: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setFrame(document.getElementById("device-canvas") ?? document.body); }, []);
  useLayoutEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(144, Math.max(48, field.scrollHeight))}px`;
  }, [text, active, frame]);
  const send = () => {
    if (!disabled && text.trim()) { onSubmit(text.trim()); setText(""); }
  };
  const composer = (
    <form className="absolute inset-x-0 bottom-0 z-20 border-t border-border/60 bg-surface px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-3"
      onSubmit={(event) => { event.preventDefault(); send(); }}>
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-muted/40 p-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
        <textarea ref={textarea} id="goal-coach-input" aria-label={GOALS_COPY.coach.inputLabel} disabled={disabled}
          className="min-h-12 max-h-36 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-3 text-[16px] leading-6 text-text placeholder:text-muted/70 focus:outline-none"
          rows={1} value={text} maxLength={MAX} placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          }} />
        <button type="submit" aria-label="Gửi mục tiêu" disabled={disabled || !text.trim()}
          className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg transition-colors disabled:bg-border disabled:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          <ArrowUp size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 px-1 text-[12px] leading-4 text-muted">M-You giúp lập kế hoạch. Bạn kiểm tra trước khi lưu.</p>
    </form>
  );
  return (
    <>
      {showSuggestions && <div className="flex flex-wrap gap-2" aria-label="Mục tiêu gợi ý">
        {["Quỹ dự phòng", "Mua xe", "Du lịch"].map((goal) => (
          <button key={goal} type="button" disabled={disabled} className={chip} onClick={() => { setText(`Tôi muốn tiết kiệm cho ${goal.toLowerCase()}`); textarea.current?.focus(); }}>{goal}</button>
        ))}
      </div>}
      {active && frame && createPortal(composer, frame)}
    </>
  );
}
