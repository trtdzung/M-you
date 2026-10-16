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
  /** Opener-derived quick suggestion, surfaced first when present. */
  openerStarter?: string | null;
  /** Optional hint line under the input (e.g. when the composer is disabled). */
  hint?: string;
}

export function Composer({ value, onChange, onSend, disabled, showStarters, openerStarter, hint }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  // Merge the opener suggestion ahead of the fixed starters, de-duplicated.
  const starters = openerStarter
    ? [openerStarter, ...STARTER_PROMPTS.filter((p) => p !== openerStarter)]
    : STARTER_PROMPTS;

  return (
    <div className="shadow-nav shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+var(--safe-area-bottom))]">
      {showStarters && (
        <div className="no-scrollbar mb-2.5 flex gap-2 overflow-x-auto pb-0.5">
          {starters.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(p);
                ref.current?.focus();
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text transition-colors hover:bg-surface-muted"
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
          disabled={disabled}
          placeholder="Hỏi bất kỳ điều gì về tài chính của bạn…"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus:bg-surface"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Gửi"
          className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>

      {hint && <p className="mt-1.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
