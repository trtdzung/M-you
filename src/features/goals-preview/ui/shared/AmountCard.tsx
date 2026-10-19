"use client";

import { useId } from "react";
import { amountInWords } from "@/features/goals/ui/form/amount-in-words";
import { cn } from "@/lib/cn";
import { InfoTooltip } from "./InfoTooltip";
import { parseVndInput } from "./MoneyInput";
import { card, chip, chipSelected, fieldError, ring, sectionTitle } from "./styles";

const groupFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * The big amount field used on money screens (plan, deposit, withdraw): a card with a section
 * title, a 28px number, labelled quick-pick chips, and the amount in words in a tooltip.
 */
export function AmountCard({
  title,
  value,
  onChange,
  chips = [],
  error,
  help,
  autoFocus,
}: {
  title: string;
  value: number | null;
  onChange: (value: number | null) => void;
  chips?: { label: string; amount: number }[];
  error?: string;
  /** Extra tooltip text shown next to the title. */
  help?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const words = value && value > 0 ? amountInWords(value) : "";
  const tip = [words, help].filter(Boolean).join(" · ");
  return (
    <section className={`${card} flex flex-col gap-3`} aria-labelledby={id}>
      <div className="flex items-center gap-1">
        <h2 id={id} className={sectionTitle}>
          {title}
        </h2>
        {tip && <InfoTooltip label="giải thích số tiền" text={tip} />}
      </div>
      <div className="flex items-baseline gap-2">
        <input
          aria-labelledby={id}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          value={value === null ? "" : groupFormatter.format(value)}
          onChange={(e) => onChange(parseVndInput(e.target.value))}
          aria-invalid={error ? true : undefined}
          className={cn("min-h-12 w-full min-w-0 rounded-lg bg-transparent text-[28px] font-bold tabular-nums text-text placeholder:text-muted", ring)}
        />
        <span className="text-sm text-muted">VND</span>
      </div>
      {error && <p className={fieldError}>{error}</p>}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.label} type="button" className={c.amount === value ? chipSelected : chip} onClick={() => onChange(c.amount)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
