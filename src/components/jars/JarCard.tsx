"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { JarPartitionLine } from "@/domain/engine";
import { Freshness, Money, SourceBadge } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { cn } from "@/lib/cn";

const PALETTE = [
  "bg-primary",
  "bg-source-msb",
  "bg-source-self",
  "bg-source-estimated",
  "bg-warning",
  "bg-positive",
];

/**
 * One jar keeps two time frames visible at once: its share of the current
 * account balance and the expense observed in the selected month. The expense
 * never masquerades as a depleted balance, and the warning compares it with
 * the current share instead of calling it a monthly budget.
 */
export function JarCard({
  line,
  accent,
  periodLabel,
}: {
  line: JarPartitionLine;
  accent?: string;
  periodLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const progress = line.earmark > 0
    ? Math.min(100, Math.max(0, (line.spentThisPeriod / line.earmark) * 100))
    : line.spentThisPeriod > 0
      ? 100
      : 0;
  const periodText = periodLabel ? "Đã chi " + periodLabel : "Đã chi kỳ này";

  return (
    <article className="rounded-[20px] bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent ?? PALETTE[0])}
          aria-hidden="true"
        />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-text">{line.label}</h3>
        {line.perCategory.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={"jar-cats-" + line.jarId}
            onClick={() => setOpen((value) => !value)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronDown size={18} className={cn("transition-transform", open && "rotate-180")} aria-hidden="true" />
            <span className="sr-only">{open ? "Ẩn" : "Xem"} danh mục trong hũ</span>
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-muted p-3">
          <p className="text-xs text-muted">Phần chia hiện tại</p>
          <Money amount={line.earmark} className="mt-1 block text-base font-bold text-text" />
          <p className="mt-0.5 text-xs text-muted">theo số dư hiện tại</p>
        </div>
        <div className="rounded-2xl bg-surface-muted p-3">
          <p className="text-xs text-muted">{periodText}</p>
          <Money amount={line.spentThisPeriod} className="mt-1 block text-base font-bold text-text" />
          <DeltaBadge current={line.spentThisPeriod} previous={line.spentPrevPeriod} goodWhenDown className="mt-0.5" />
        </div>
      </div>

      <div className="mt-3" aria-label={"Đã chi so với phần chia hiện tại của " + line.label}>
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>Đối chiếu với phần chia hiện tại</span>
          <span className="tabular-nums font-medium text-text">{Math.round(progress)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className={cn("h-full rounded-full", line.isOverBudget ? "bg-warning" : "bg-primary")} style={{ width: String(progress) + "%" }} />
        </div>
      </div>

      {line.isOverBudget && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Chi tháng này vượt phần chia hiện tại <Money amount={line.spentThisPeriod - line.earmark} className="font-medium text-warning" />.
        </p>
      )}

      {open && (
        <ul id={"jar-cats-" + line.jarId} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {line.perCategory.map((category) => (
            <li key={category.categoryId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted">{category.label}</span>
              <Money amount={category.spent} className="shrink-0 text-text" />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <SourceBadge source={line.meta.source} />
        <Freshness at={line.meta.freshness} />
      </div>
    </article>
  );
}
