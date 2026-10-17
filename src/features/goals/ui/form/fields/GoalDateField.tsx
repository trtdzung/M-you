"use client";

import { useId, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
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
  const today = todayVn(transferNow());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const minYear = Number(min.slice(0, 4));
  const [yearStart, setYearStart] = useState(minYear);
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
          setView("days");
          setOpen(true);
        }} className={`${input} flex w-full items-center justify-between text-[16px]`}>
          <span className={value ? "text-text" : "text-muted"}>{value ? value.split("-").reverse().join("/") : "Chọn ngày hoàn thành"}</span>
          <CalendarDays size={20} className="text-muted" aria-hidden="true" />
        </button>
        {open && <Sheet title="Ngày hoàn thành" description="Chọn ngày bạn muốn đạt mục tiêu." onClose={() => setOpen(false)}>
          <div className="mb-4 flex h-11 items-center justify-between gap-1">
            <button type="button" aria-label="Tháng trước" disabled={month <= min.slice(0, 7)} onClick={() => shift(-1)} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted disabled:opacity-30"><ChevronLeft size={20} /></button>
            <div className="flex items-center justify-center gap-1">
            <button type="button" aria-label="Chọn tháng" aria-expanded={view === "months"} onClick={() => setView(view === "months" ? "days" : "months")} className={`flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[15px] min-[360px]:px-4 font-semibold transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${view === "months" ? "text-primary" : "text-text"}`}>Tháng {monthNumber}<ChevronDown size={14} strokeWidth={1.75} className="text-muted" aria-hidden="true" /></button>
            <button type="button" aria-label="Chọn năm" aria-expanded={view === "years"} onClick={() => { setYearStart(Math.max(minYear, year - 5)); setView(view === "years" ? "days" : "years"); }} className={`flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[15px] min-[360px]:px-4 font-semibold transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${view === "years" ? "text-primary" : "text-text"}`}>{year}<ChevronDown size={14} strokeWidth={1.75} className="text-muted" aria-hidden="true" /></button>
            </div>
            <button type="button" aria-label="Tháng sau" onClick={() => shift(1)} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted"><ChevronRight size={20} /></button>
          </div>
          <div className="mb-3 flex h-9 items-center justify-between">
            <span className="text-xs text-muted">Hôm nay: {today.split("-").reverse().join("/")}</span>
            <button type="button" onClick={() => { setMonth(today.slice(0, 7)); setView("days"); }} className="min-h-9 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Hôm nay</button>
          </div>
          <div className="h-[328px] overflow-y-auto">
          {view === "months" && <div className="grid grid-cols-3 gap-2" aria-label="Chọn tháng">
            {Array.from({length: 12}, (_, i) => {
              const next = `${year}-${String(i + 1).padStart(2, "0")}`;
              return <button key={i} type="button" disabled={next < min.slice(0, 7)} aria-pressed={monthNumber === i + 1} onClick={() => { setMonth(next); setView("days"); }} className={`min-h-12 rounded-xl text-sm disabled:opacity-25 ${monthNumber === i + 1 ? "bg-primary text-primary-fg font-semibold" : "bg-surface-muted text-text"}`}>Tháng {i + 1}</button>;
            })}
          </div>}
          {view === "years" && <div>
            <div className="mb-3 flex items-center justify-between">
              <button type="button" aria-label="Khoảng năm trước" disabled={yearStart <= minYear} onClick={() => setYearStart(Math.max(minYear, yearStart - 12))} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted disabled:opacity-25"><ChevronLeft size={20} /></button>
              <span className="text-sm font-medium text-muted">{yearStart} – {yearStart + 11}</span>
              <button type="button" aria-label="Khoảng năm sau" onClick={() => setYearStart(yearStart + 12)} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted"><ChevronRight size={20} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2" aria-label="Chọn năm">
              {Array.from({length:12}, (_, i) => yearStart + i).map(y => <button key={y} type="button" aria-pressed={y === year} onClick={() => {
                const next = `${y}-${String(monthNumber).padStart(2, "0")}`;
                setMonth(next < min.slice(0, 7) ? min.slice(0, 7) : next);
                setView("months");
              }} className={`min-h-12 rounded-xl text-sm ${y === year ? "bg-primary text-primary-fg font-semibold" : "bg-surface-muted text-text"}`}>{y}</button>)}
            </div>
          </div>}
          {view === "days" && <div className="grid grid-cols-7 gap-1 text-center">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <span key={day} className="py-2 text-xs font-medium text-muted">{day}</span>)}
            {Array.from({length:offset}, (_, i) => <span key={`blank-${i}`} />)}
            {Array.from({length:days}, (_, i) => {
              const date = `${month}-${String(i+1).padStart(2,"0")}`;
              return <button key={date} type="button" aria-label={date.split("-").reverse().join("/")} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} disabled={date < min} onClick={() => setSelected(date)} className={`min-h-11 rounded-xl text-[15px] ${date === today ? "border border-primary bg-primary/10 font-semibold text-primary" : "disabled:opacity-25"} ${selected === date ? "bg-primary font-semibold text-primary-fg" : date === today ? "" : "text-text hover:bg-surface-muted"}`}>{i+1}</button>;
            })}
          </div>}
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
