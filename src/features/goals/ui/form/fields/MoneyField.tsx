"use client";

import { useId } from "react";
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
  const display = /^\d[\d,]*$/.test(value) ? value.replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") : value;
  const digits = value.replace(/,/g, "");
  const suggestions = /^[1-9]\d{0,2}$/.test(digits)
    ? Array.from({ length: 4 - digits.length }, (_, index) => Number(digits) * 10 ** index)
    : [];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
      <input
        id={id}
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/,/g, ""))}
        inputMode="numeric"
        aria-invalid={error ? true : undefined}
        placeholder="0"
        className={`${input} w-full border-primary/30 bg-primary/5 pr-16 text-[18px] font-semibold tabular-nums text-right focus:border-primary placeholder:font-normal`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[13px] font-semibold text-primary">VND</span>
      </div>
      {suggestions.length > 0 && <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Gợi ý ${label.toLowerCase()}`}>
        {suggestions.map(millions => <button key={millions} type="button" onClick={() => onChange(String(millions * 1_000_000))} className="min-h-9 rounded-full border border-primary/20 bg-primary/5 px-3 text-[13px] font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{millions} triệu</button>)}
      </div>}
      {hint && <p className={hintClass}>{hint}</p>}
      {error && (
        <p role="alert" className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
