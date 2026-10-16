"use client";

import { Calendar } from "lucide-react";
import { usePeriod } from "@/state/period";

/** Month selector bound to the shared period context. */
export function PeriodPicker() {
  const { month, setMonth, options } = usePeriod();
  return (
    <label className="shadow-card inline-flex min-h-[44px] items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/50">
      <Calendar size={16} className="text-primary" />
      <span className="sr-only">Chọn tháng</span>
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="bg-transparent text-sm font-semibold text-text outline-none"
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
