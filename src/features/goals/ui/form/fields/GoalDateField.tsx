"use client";

import { useId, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { transferNow } from "@/lib/demo-clock";
import { todayVn } from "../../../model/today";
import { GOALS_COPY } from "../../copy";
import { fieldError, input, label, primaryButton } from "../../styles";

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
  customCalendar = false,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  customCalendar?: boolean;
}) {
  const id = useId();
  const min = tomorrow();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value);
  const [month, setMonth] = useState((value || min).slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const shift = (amount: number) => {
    const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    setMonth(date.toISOString().slice(0, 7));
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={label}>
        {GOALS_COPY.form.targetDate}
      </label>
      {customCalendar ? <>
        <button id={id} type="button" aria-invalid={error ? true : undefined} onClick={() => {
          setSelected(value);
          setMonth((value || min).slice(0, 7));
          setOpen(true);
        }} className={`${input} flex w-full items-center justify-between text-[16px]`}>
          <span className={value ? "text-text" : "text-muted"}>{value ? value.split("-").reverse().join("/") : "Chọn ngày hoàn thành"}</span>
          <CalendarDays size={20} className="text-muted" aria-hidden="true" />
        </button>
        {open && <Sheet title="Ngày hoàn thành" description="Chọn ngày bạn muốn đạt mục tiêu." onClose={() => setOpen(false)}>
          <div className="mb-4 flex items-center gap-2">
            <button type="button" aria-label="Tháng trước" disabled={month <= min.slice(0, 7)} onClick={() => shift(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted disabled:opacity-30"><ChevronLeft size={20} /></button>
            <label className="sr-only" htmlFor={`${id}-month`}>Tháng</label>
            <select id={`${id}-month`} value={monthNumber} onChange={(e) => setMonth(`${year}-${e.target.value.padStart(2, "0")}`)} className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface-muted px-2 text-sm font-medium">
              {Array.from({length:12}, (_, i) => <option key={i} value={i+1}>Tháng {i+1}</option>)}
            </select>
            <label className="sr-only" htmlFor={`${id}-year`}>Năm</label>
            <select id={`${id}-year`} value={year} onChange={(e) => setMonth(`${e.target.value}-${String(monthNumber).padStart(2, "0")}`)} className="min-h-11 rounded-xl bg-surface-muted px-2 text-sm font-medium">
              {Array.from({length:Math.max(31, year-Number(min.slice(0,4))+1)}, (_, i) => Number(min.slice(0,4))+i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" aria-label="Tháng sau" onClick={() => shift(1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted"><ChevronRight size={20} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <span key={day} className="py-2 text-xs font-medium text-muted">{day}</span>)}
            {Array.from({length:offset}, (_, i) => <span key={`blank-${i}`} />)}
            {Array.from({length:days}, (_, i) => {
              const date = `${month}-${String(i+1).padStart(2,"0")}`;
              return <button key={date} type="button" aria-label={date.split("-").reverse().join("/")} aria-pressed={selected === date} disabled={date < min} onClick={() => setSelected(date)} className={`min-h-11 rounded-xl text-[15px] disabled:opacity-25 ${selected === date ? "bg-primary font-semibold text-primary-fg" : "text-text hover:bg-surface-muted"}`}>{i+1}</button>;
            })}
          </div>
          <button type="button" disabled={!selected || selected < min} className={`${primaryButton} mt-5 w-full`} onClick={() => { onChange(selected); setOpen(false); }}>Chọn ngày này</button>
        </Sheet>}
      </> : <input
        id={id}
        type="date"
        min={tomorrow()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={input}
      />}
      {error && (
        <p role="alert" className={fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
