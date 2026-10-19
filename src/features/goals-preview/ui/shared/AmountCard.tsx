"use client";

import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { amountInWords } from "@/features/goals/ui/form/amount-in-words";
import { formatVndCompact } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { InfoTooltip } from "./InfoTooltip";
import { card, fieldError, ring, sectionTitle } from "./styles";

const groupFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/** 12 digits = up to 999 tỷ, enough for any goal and keeps the number on one line. */
const MAX_DIGITS = 12;

/** Chip labels use the app's normal compact amounts ("15,78 triệu đồng", "1,5 tỷ đồng"), never ad-hoc abbreviations. */
export function formatShort(amount: number): string {
  return formatVndCompact(amount);
}

/** Small outline chip for amount suggestions; selected = soft fill, never a solid CTA look. */
export function SuggestChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-medium tabular-nums transition-colors",
        selected ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface text-text hover:bg-surface-muted",
        ring,
      )}
    >
      {label}
    </button>
  );
}

function digitsBefore(text: string, pos: number): number {
  return text.slice(0, pos).replace(/\D/g, "").length;
}

function caretAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) seen += 1;
    if (seen === count) return i + 1;
  }
  return text.length;
}

/**
 * Big VND amount input: thousands separators while typing without moving the caret,
 * Backspace/Delete skip over separators, max 12 digits, unit right after the number,
 * underline instead of a box, smaller text for long numbers.
 */
export function AmountField({
  value,
  onChange,
  labelledBy,
  invalid,
  autoFocus,
  size = "lg",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  labelledBy: string;
  invalid?: boolean;
  autoFocus?: boolean;
  size?: "lg" | "md";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const text = value === null ? "" : groupFormatter.format(value);

  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    const pos = caretAfterDigits(text, caret.current);
    ref.current.setSelectionRange(pos, pos);
    caret.current = null;
  });

  const commit = (raw: string, digitsBeforeCaret: number) => {
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
    caret.current = Math.min(digitsBeforeCaret, digits.length);
    const next = digits ? Number(digits) : null;
    if (next === value && ref.current) {
      // Same number (e.g. a letter was typed): put the text and caret back without a re-render.
      ref.current.value = text;
      const pos = caretAfterDigits(text, caret.current);
      ref.current.setSelectionRange(pos, pos);
      caret.current = null;
      return;
    }
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === null || end === null || start !== end) return;
    // Deleting a separator removes the digit next to it instead of doing nothing.
    if (e.key === "Backspace" && start > 0 && text[start - 1] === ",") {
      e.preventDefault();
      const before = digitsBefore(text, start);
      const digits = text.replace(/\D/g, "");
      commit(digits.slice(0, before - 1) + digits.slice(before), before - 1);
    } else if (e.key === "Delete" && text[start] === ",") {
      e.preventDefault();
      const before = digitsBefore(text, start);
      const digits = text.replace(/\D/g, "");
      commit(digits.slice(0, before) + digits.slice(before + 1), before);
    }
  };

  const long = text.length > 11;
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 border-b-2 pb-1 transition-colors",
        invalid ? "border-negative" : "border-border focus-within:border-primary",
      )}
    >
      <input
        ref={ref}
        aria-labelledby={labelledBy}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="0"
        value={text}
        onKeyDown={onKeyDown}
        onChange={(e) => commit(e.target.value, digitsBefore(e.target.value, e.target.selectionStart ?? e.target.value.length))}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          "min-w-0 flex-1 bg-transparent font-bold tabular-nums text-text outline-none placeholder:text-muted",
          size === "lg" ? (long ? "text-[22px]" : "text-[28px]") : long ? "text-[18px]" : "text-[22px]",
        )}
      />
      <span className="shrink-0 text-sm font-semibold text-muted">VND</span>
    </div>
  );
}

/**
 * The amount block used on money screens (plan, deposit, withdraw, auto-debit): a card with a
 * section title, the AmountField, short suggestion chips, and the amount in words in a tooltip.
 */
export function AmountCard({
  title,
  value,
  onChange,
  chips = [],
  error,
  help,
  autoFocus,
  bare = false,
}: {
  title: string;
  value: number | null;
  onChange: (value: number | null) => void;
  chips?: { label: string; amount: number }[];
  error?: string;
  /** Extra tooltip text shown next to the title. */
  help?: string;
  autoFocus?: boolean;
  /** Render without the card (when already inside one). */
  bare?: boolean;
}) {
  const id = useId();
  const words = value && value > 0 ? amountInWords(value) : "";
  const tip = [words, help].filter(Boolean).join(" · ");
  const Wrapper = bare ? "div" : "section";
  return (
    <Wrapper className={cn(!bare && card, "flex flex-col gap-3")} aria-labelledby={bare ? undefined : id}>
      <div className="flex items-center gap-1">
        <h2 id={id} className={sectionTitle}>
          {title}
        </h2>
        {tip && <InfoTooltip label="giải thích số tiền" text={tip} />}
      </div>
      <AmountField value={value} onChange={onChange} labelledBy={id} invalid={!!error} autoFocus={autoFocus} />
      {error && <p className={fieldError}>{error}</p>}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <SuggestChip key={c.label} label={c.label} selected={c.amount === value} onClick={() => onChange(c.amount)} />
          ))}
        </div>
      )}
    </Wrapper>
  );
}
