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
        className={`${input} w-full border-primary/30 bg-primary/5 pr-20 text-[18px] font-semibold tabular-nums text-right focus:border-primary placeholder:font-normal`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center"><span className="rounded-md bg-primary/10 px-2 py-1 text-[13px] font-semibold text-primary">VND</span></span>
      </div>
      {hint && <p className={hintClass}>{hint}</p>}
      {error && (
        <p role="alert" className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
