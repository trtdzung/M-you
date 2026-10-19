"use client";

import { useId } from "react";
import { amountInWords } from "@/features/goals/ui/form/amount-in-words";
import { formatVnd, formatVndCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { chip, fieldError, hint as hintClass, input, label as labelClass } from "./styles";

const groupFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "12,500,000" ↔ 12500000 (digits only, VND has no decimals). */
export function parseVndInput(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits.slice(0, 15));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * VND amount field: thousands separators while typing, "VND" suffix, amount in
 * words below, optional quick-pick chips and a max ("Tối đa …") shortcut.
 */
export function MoneyInput({
  value,
  onChange,
  label,
  hint,
  error,
  max,
  quickAmounts,
  placeholder = "0",
  autoFocus,
  disabled,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  hint?: string;
  error?: string;
  /** Shows a "Tối đa" chip and an inline error when exceeded. */
  max?: number;
  quickAmounts?: number[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const over = max !== undefined && value !== null && value > max;
  const shownError = error ?? (over ? `Vượt quá số tiền tối đa ${formatVnd(max)}.` : undefined);
  const words = value && value > 0 ? amountInWords(value) : "";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={hintId}
          value={value === null ? "" : groupFormatter.format(value)}
          onChange={(event) => onChange(parseVndInput(event.target.value))}
          className={cn(input, "pr-14 text-[18px] font-semibold tabular-nums", shownError && "border-negative")}
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">
          VND
        </span>
      </div>
      <div id={hintId} className="flex flex-col gap-0.5">
        {words && <p className="text-[13px] italic leading-5 text-muted">{words}</p>}
        {shownError ? <p className={fieldError}>{shownError}</p> : hint ? <p className={hintClass}>{hint}</p> : null}
      </div>
      {(quickAmounts?.length || max !== undefined) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {quickAmounts?.map((amount) => (
            <button key={amount} type="button" className={chip} disabled={disabled} onClick={() => onChange(amount)}>
              {formatVndCompact(amount)}
            </button>
          ))}
          {max !== undefined && max > 0 && (
            <button type="button" className={chip} disabled={disabled} onClick={() => onChange(max)}>
              Tối đa {formatVndCompact(max)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
