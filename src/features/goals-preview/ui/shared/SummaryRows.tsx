import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ValueSource } from "../../model/types";
import { Amount } from "./Amount";
import { SOURCE_LABEL } from "../../model/labels";

export interface SummaryRow {
  label: string;
  /** Number → formatted VND (with optional source tag); anything else rendered as-is. */
  value: number | ReactNode;
  source?: ValueSource;
  emphasis?: boolean;
  hint?: string;
}

/** Label / value rows used in confirmations and detail cards. */
export function SummaryRows({ rows, className }: { rows: SummaryRow[]; className?: string }) {
  const sources = [...new Set(rows.flatMap((row) => row.source ? [row.source] : []))];
  return (
    <div className="flex flex-col gap-2">
    <dl className={cn("divide-y divide-border rounded-2xl bg-surface-muted/70 px-4", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1.5 py-3">
          <dt className="text-sm text-muted">
            {row.label}
            {row.hint && <span className="block text-[12px] leading-4 text-muted/80">{row.hint}</span>}
          </dt>
          <dd className={cn("text-left text-sm text-text whitespace-nowrap", row.emphasis && "text-base font-bold")}>
            {typeof row.value === "number" ? <Amount amount={row.value} source={row.source} /> : row.value}
          </dd>
        </div>
      ))}
    </dl>
    {sources.length > 0 && <p className="px-1 text-[11px] text-muted">Nguồn: {sources.map((source) => SOURCE_LABEL[source]).join(" · ")}</p>}
    </div>
  );
}
