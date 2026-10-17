"use client";

import { useId } from "react";
import { transferNow } from "@/lib/demo-clock";
import { todayVn } from "../../../model/today";
import { GOALS_COPY } from "../../copy";
import { fieldError, input, label } from "../../styles";

/** "YYYY-MM-DD" of the day after the demo "today" (a goal must end after today). */
function tomorrow(): string {
  const d = new Date(`${todayVn(transferNow())}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function GoalDateField({
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
        {GOALS_COPY.form.targetDate}
      </label>
      <input
        id={id}
        type="date"
        min={tomorrow()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
