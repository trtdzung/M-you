"use client";

import { Calendar } from "lucide-react";
import { usePeriod } from "@/state/period";

/** Month selector bound to the shared period context. */
export function PeriodPicker() {
  const { month, setMonth, options } = usePeriod();
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
      <Calendar size={16} className="text-muted" />
      <span className="sr-only">Chọn tháng</span>
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="bg-transparent text-sm font-medium text-text outline-none"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
