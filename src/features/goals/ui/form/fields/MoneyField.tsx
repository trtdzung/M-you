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
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        aria-invalid={error ? true : undefined}
        className={`${input} text-right`}
      />
      {hint && <p className={hintClass}>{hint}</p>}
      {error && (
        <p role="alert" className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
