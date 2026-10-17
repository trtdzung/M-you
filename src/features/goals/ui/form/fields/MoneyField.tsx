"use client";

import { useId, useState } from "react";
import { parseVndInput } from "@/components/settings/parse-vnd-input";
import { amountInWords } from "../amount-in-words";
import { fieldError, hint as hintClass, input, label as labelClass } from "../../styles";

export function MoneyField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const parsed = parseVndInput(value);
  const words = parsed.kind === "ok" ? amountInWords(parsed.value) : "";
  const display = /^\d[\d,]*$/.test(value) ? value.replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") : value;
  const digits = value.replace(/,/g, "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [active, setActive] = useState(-1);
  const normalized = digits.replace(/^0+/, "");
  const suggestions = /^\d+$/.test(normalized)
    ? [7, 8, 9].filter(length => length > normalized.length).map(length => Number(normalized.padEnd(length, "0")))
    : [];
  const expanded = showSuggestions && suggestions.length > 0;
  const choose = (amount: number) => {
    onChange(String(amount));
    setShowSuggestions(false);
    setActive(-1);
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowSuggestions(false);
      }}>
      <input
        id={id}
        value={display}
        onChange={(e) => { onChange(e.target.value.replace(/,/g, "")); setShowSuggestions(true); setActive(-1); }}
        onFocus={() => setShowSuggestions(true)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-suggestions` : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${id}-suggestion-${active}` : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") setShowSuggestions(false);
          if (!expanded) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive(previous => (previous + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
          }
          if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(suggestions[active]); }
        }}
        inputMode="numeric"
        aria-invalid={error ? true : undefined}
        aria-describedby={words ? `${id}-words` : undefined}
        placeholder="0"
        className={`${input} w-full border-primary/30 bg-primary/5 pr-16 text-[18px] font-semibold tabular-nums text-right focus:border-primary placeholder:font-normal`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[13px] font-semibold text-primary">VND</span>
      {expanded && <div id={`${id}-suggestions`} className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-card" role="listbox" aria-label={`Gợi ý ${label.toLowerCase()}`}>
        {suggestions.map((amount, index) => <button key={amount} id={`${id}-suggestion-${index}`} type="button" role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(amount)} className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-border/50 px-4 py-3 text-left last:border-b-0 hover:bg-primary/5 focus-visible:bg-primary/5 ${active === index ? "bg-primary/5" : ""}`}>
          <span className="text-[16px] font-medium tabular-nums text-text">{amount.toLocaleString("en-US")} <span className="text-[13px] text-muted">VND</span></span>
          <span className="text-[13px] text-muted">{amount / 1_000_000} triệu</span>
        </button>)}
      </div>}
      </div>
      {words && <p id={`${id}-words`} className="mt-1 text-[13px] leading-5 text-muted">{words}</p>}
      {hint && <p className={hintClass}>{hint}</p>}
      {error && (
        <p role="alert" className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
