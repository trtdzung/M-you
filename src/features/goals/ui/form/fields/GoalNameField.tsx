"use client";

import { useId } from "react";
import { GOALS_COPY } from "../../copy";
import { fieldError, input, label } from "../../styles";

export function GoalNameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={label}>
        {GOALS_COPY.form.name}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={GOALS_COPY.form.namePlaceholder}
        maxLength={80}
        aria-invalid={error ? true : undefined}
        className={input}
      />
      {error && (
        <p role="alert" className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
