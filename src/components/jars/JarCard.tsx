"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { JarLine } from "@/domain/engine";
import { Freshness, Money, SourceBadge } from "@/components/primitives";
import { PressureRow, type PressureVariant } from "@/components/budget/PressureRow";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<string, string> = {
  ok: "Trong hạn mức",
  near: "Sắp vượt",
  over: "Vượt hạn mức",
};

/**
 * One jar rendered as a pressure card with a per-category drill-down and a
 * provenance footer. Three special shapes, all from the engine line:
 *  - `isUnassigned` ("Chưa phân hũ") → NEUTRAL, amount-only, never a status (M13).
 *  - `status: "unknown"` (percent jar, income unresolved) → NEUTRAL grey with a
 *    "đặt thu nhập" prompt and the raw spend shown; never green "ok" (C1).
 *  - `stale` (viewing a past month) → suppress days-left/urgency (H2).
 */
export function JarCard({
  line,
  accent,
  stale,
}: {
  line: JarLine;
  accent: string;
  stale: boolean;
}) {
  const [open, setOpen] = useState(false);

  const isUnknown = line.status === "unknown" || line.allocated === null;
  const variant: PressureVariant = line.isUnassigned
    ? "neutral"
    : isUnknown
      ? "unknown"
      : (line.status as PressureVariant);

  const statusLabel = line.isUnassigned || isUnknown ? undefined : STATUS_LABEL[line.status];
  const rightLabel =
    stale || isUnknown || line.isUnassigned
      ? undefined
      : line.daysLeft > 0
        ? `Còn ${line.daysLeft} ngày`
        : "Đã hết kỳ";
  const limitLabel = isUnknown && !line.isUnassigned ? "chưa xác định TN" : undefined;

  return (
    <div className="rounded-2xl bg-surface-muted/40 p-3">
      <PressureRow
        label={line.label}
        used={line.used}
        limit={line.allocated}
        pct={line.pct}
        variant={variant}
        statusLabel={statusLabel}
        rightLabel={rightLabel}
        limitLabel={limitLabel}
        accent={
          line.isUnassigned ? undefined : (
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent)} aria-hidden />
          )
        }
      />

      {isUnknown && !line.isUnassigned && (
        <p className="mt-1.5 text-xs text-muted">
          Chưa xác định thu nhập —{" "}
          <Link href="/pfm/jars" className="font-medium text-primary underline">
            đặt thu nhập
          </Link>
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
              <Money amount={c.used} className="text-text" />
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
