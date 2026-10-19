"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { chip, chipSelected, ring } from "./styles";

/** On/off switch with the app's colours (replaces checkbox-style toggles). */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-surface-muted", ring)}
    >
      <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow-card transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

const QUICK_DAYS = [1, 5, 10, 15, 20, 25];
const gridCell = (selected: boolean) =>
  cn(
    "flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold tabular-nums transition-colors",
    selected ? "bg-primary text-primary-fg" : "bg-surface-muted text-text hover:bg-primary-soft",
    ring,
  );

/** Day of month (1–28): quick chips, plus a sheet with every day for anything else. */
export function DayOfMonthPicker({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  const [open, setOpen] = useState(false);
  const custom = !QUICK_DAYS.includes(value);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {QUICK_DAYS.map((d) => (
          <button key={d} type="button" className={d === value ? chipSelected : chip} onClick={() => onChange(d)}>
            Ngày {d}
          </button>
        ))}
        <button type="button" className={custom ? chipSelected : chip} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <CalendarDays size={16} aria-hidden className="mr-1.5" /> {custom ? `Ngày ${value}` : "Ngày khác"}
        </button>
      </div>
      <Sheet open={open} title="Chọn ngày trong tháng" onClose={() => setOpen(false)}>
        <div className="grid grid-cols-7 gap-2 pb-2">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === value}
              className={gridCell(d === value)}
              onClick={() => {
                onChange(d);
                setOpen(false);
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Month + year picker in a sheet: year chips on top, a 12-month grid below. */
export function MonthYearSheet({
  open,
  onClose,
  years,
  year,
  month,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  years: number[];
  year: number;
  month: number;
  onPick: (year: number, month: number) => void;
}) {
  const [shownYear, setShownYear] = useState(year);
  return (
    <Sheet open={open} title="Chọn tháng đạt mục tiêu" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Năm">
          {years.map((y) => (
            <button key={y} type="button" className={cn(y === shownYear ? chipSelected : chip, "shrink-0")} onClick={() => setShownYear(y)}>
              {y}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Tháng năm ${shownYear}`}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={shownYear === year && m === month}
              className={gridCell(shownYear === year && m === month)}
              onClick={() => {
                onPick(shownYear, m);
                onClose();
              }}
            >
              Th {m}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
