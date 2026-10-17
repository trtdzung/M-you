"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { monthPeriodFromKey, netExpenseByCategory, VN_UTC_OFFSET_MS, addMonthsToKey } from "@/domain/engine";
import { Card, SectionHeader } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DEMO_NOW } from "@/lib/demo-clock";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
const COMPACT_NUMBER = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

function dayCount(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayKey(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function monthTitle(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `Tháng ${month}, ${year}`;
}

function compactSpend(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `-${COMPACT_NUMBER.format(abs / 1_000_000_000)}Tỷ`;
  if (abs >= 1_000_000) return `-${COMPACT_NUMBER.format(abs / 1_000_000)}Tr`;
  if (abs >= 1_000) return `-${COMPACT_NUMBER.format(abs / 1_000)}K`;
  return `-${Math.round(abs)}₫`;
}

/** Daily totals use the same posted, refund, transfer, and rebalance rules as cashflow. */
function spendByDay(transactions: Transaction[], monthKey: string): Map<number, number> {
  const groups = new Map<number, Transaction[]>();

  for (const transaction of transactions) {
    const timestamp = Date.parse(transaction.postedAt);
    if (!Number.isFinite(timestamp)) continue;

    // The engine's business calendar is Vietnam UTC+7, including dates near midnight.
    const vnDate = new Date(timestamp + VN_UTC_OFFSET_MS);
    const transactionMonth = `${vnDate.getUTCFullYear()}-${String(vnDate.getUTCMonth() + 1).padStart(2, "0")}`;
    if (transactionMonth !== monthKey) continue;

    const day = vnDate.getUTCDate();
    const dayTransactions = groups.get(day);
    if (dayTransactions) dayTransactions.push(transaction);
    else groups.set(day, [transaction]);
  }

  const period = monthPeriodFromKey(monthKey);
  const totals = new Map<number, number>();
  for (const [day, dayTransactions] of groups) {
    const total = Array.from(netExpenseByCategory(dayTransactions, period).values()).reduce((sum, amount) => sum + amount, 0);
    if (total > 0) totals.set(day, total);
  }
  return totals;
}

export function SpendingCalendar({
  monthKey,
  transactions,
  onOpenReport,
}: {
  monthKey: string;
  transactions: Transaction[];
  onOpenReport: (monthKey: string) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(monthKey);
  const today = new Date(DEMO_NOW.getTime() + VN_UTC_OFFSET_MS).getUTCDate();
  const [selectedDate, setSelectedDate] = useState(() => dayKey(monthKey, Math.min(today, dayCount(monthKey))));

  const [year, month] = visibleMonth.split("-").map(Number);
  const count = dayCount(visibleMonth);
  const leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const slotCount = Math.ceil((leadingBlanks + count) / 7) * 7;
  const totals = useMemo(() => spendByDay(transactions, visibleMonth), [transactions, visibleMonth]);
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const day = index - leadingBlanks + 1;
    return day > 0 && day <= count ? day : null;
  });

  function changeMonth(delta: -1 | 1) {
    const nextMonth = addMonthsToKey(visibleMonth, delta);
    if (nextMonth > monthKey) return;

    const selectedDay = Number(selectedDate.slice(-2)) || 1;
    setVisibleMonth(nextMonth);
    setSelectedDate(dayKey(nextMonth, Math.min(selectedDay, dayCount(nextMonth))));
  }

  return (
    <section aria-label="Lịch chi tiêu">
      <SectionHeader
        title="Lịch chi tiêu"
        action={
          <button
            type="button"
            onClick={() => onOpenReport(visibleMonth)}
            aria-label={`Báo cáo chi tiết tháng ${monthTitle(visibleMonth)}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Báo cáo chi tiết
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        }
      />

      <Card padding="snug">
        <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-text">{monthTitle(visibleMonth)}</h3>
          <div className="flex items-center" role="group" aria-label="Chuyển tháng">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Tháng trước"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Tháng sau"
              disabled={visibleMonth >= monthKey}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-border pb-2 text-center" aria-hidden="true">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} className="py-1 text-sm font-medium text-muted">
              {weekday}
            </span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-y-1">
          {slots.map((day, index) => {
            if (day === null) {
              return <span key={`empty-${index}`} aria-hidden="true" className="min-h-[60px]" />;
            }

            const date = dayKey(visibleMonth, day);
            const amount = totals.get(day);
            const selected = date === selectedDate;
            const todayDate = visibleMonth === monthKey && day === today;

            return (
              <button
                key={date}
                type="button"
                aria-label={
                  amount
                    ? `${day} tháng ${month} năm ${year}, chi tiêu ${formatVnd(amount)}`
                    : `${day} tháng ${month} năm ${year}, không có chi tiêu`
                }
                aria-pressed={selected}
                aria-current={todayDate ? "date" : undefined}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "flex min-h-[60px] min-w-0 flex-col items-center justify-start rounded-xl border border-transparent px-0.5 py-2 text-center transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  selected && "border-dashed border-primary",
                )}
              >
                <span className={cn("text-sm leading-5 tabular-nums", todayDate ? "font-semibold text-text" : "text-muted")}>
                  {String(day).padStart(2, "0")}
                </span>
                {amount !== undefined && (
                  <span className="mt-0.5 max-w-full truncate text-[11px] font-medium leading-4 text-negative" title={formatVnd(-amount)}>
                    {compactSpend(amount)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
