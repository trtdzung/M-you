"use client";

import { useRef, type KeyboardEvent } from "react";
import { Send, Sparkles } from "lucide-react";

/** Starter prompts — hints, not the only way in (free text is primary). */
export const STARTER_PROMPTS: string[] = [
  "Giải thích tháng này",
  "Tôi tiêu nhiều nhất vào đâu?",
  "Sắp tới phải trả gì?",
  "Nếu tiết kiệm 5 triệu/tháng, bao giờ đạt mục tiêu?",
  "Nếu trả 4 triệu/tháng, bao giờ hết nợ?",
];

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  showStarters: boolean;
}

export function Composer({ value, onChange, onSend, disabled, showStarters }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {showStarters && (
        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(p);
                ref.current?.focus();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text transition-colors hover:bg-surface-muted"
            >
              <Sparkles size={12} className="text-primary" />
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Hỏi bất kỳ điều gì về tài chính của bạn…"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Gửi"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
