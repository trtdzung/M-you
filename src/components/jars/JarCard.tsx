"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { JarPartitionLine } from "@/domain/engine";
import { Freshness, Money, SourceBadge } from "@/components/primitives";
import { PressureRow, type PressureVariant } from "@/components/budget/PressureRow";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { cn } from "@/lib/cn";

/**
 * One explicit jar rendered as two numbers over a period-spend overlay:
 *  - **chia** (`earmark`) — this jar's share of the CURRENT balance. It does NOT
 *    deplete as you spend (Model A); it only changes when the balance or the
 *    allocation changes.
 *  - **đã tiêu kỳ này** (`spentThisPeriod`) — informational overlay of the
 *    period's spend over the jar's categories, with a MoM delta.
 * `isOverBudget` (spent > chia) is a budget breach: a clear, non-blocking
 * warning ("chia" doubles as the monthly spending reference). Provenance footer
 * per invariant #5. The residual "Chưa phân bổ" line is rendered by the meter,
 * never as a jar card.
 */
export function JarCard({ line, accent }: { line: JarPartitionLine; accent: string }) {
  const [open, setOpen] = useState(false);

  const pct = line.earmark > 0 ? line.spentThisPeriod / line.earmark : null;
  const variant: PressureVariant = line.isOverBudget ? "over" : line.spentThisPeriod > 0 ? "ok" : "neutral";
  const over = line.spentThisPeriod - line.earmark;

  return (
    <div className="rounded-2xl bg-surface-muted/40 p-3">
      <PressureRow
        label={line.label}
        used={line.spentThisPeriod}
        limit={line.earmark}
        pct={pct}
        variant={variant}
        statusLabel={line.isOverBudget ? "Vượt ngân sách" : undefined}
        accent={<span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent)} aria-hidden />}
      />

      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-muted">
          đã tiêu <Money amount={line.spentThisPeriod} className="text-text" /> / chia{" "}
          <Money amount={line.earmark} className="text-text" />
        </span>
        <DeltaBadge current={line.spentThisPeriod} previous={line.spentPrevPeriod} goodWhenDown />
      </div>

      {line.isOverBudget && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Vượt ngân sách <Money amount={over} className="font-medium text-warning" /> so với phần chia.
        </p>
      )}

      {line.perCategory.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`jar-cats-${line.jarId}`}
          onClick={() => setOpen((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-muted"
        >
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
          {line.categoryIds.length} hạng mục
        </button>
      )}
      {open && (
        <ul id={`jar-cats-${line.jarId}`} className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {line.perCategory.map((c) => (
            <li key={c.categoryId} className="flex items-center justify-between text-xs">
              <span className="text-muted">{c.label}</span>
              <Money amount={c.spent} className="text-text" />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between">
        <SourceBadge source={line.meta.source} />
        <Freshness at={line.meta.freshness} className="text-[11px]" />
      </div>
    </div>
  );
}
