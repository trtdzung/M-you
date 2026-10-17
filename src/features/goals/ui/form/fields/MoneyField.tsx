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
        className={`${input} w-full pr-14 text-[16px] text-right`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] font-medium text-muted">VND</span>
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
