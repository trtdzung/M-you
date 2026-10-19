import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ValueSource } from "../../model/types";
import { Amount } from "./Amount";

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
  return (
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
  );
}
