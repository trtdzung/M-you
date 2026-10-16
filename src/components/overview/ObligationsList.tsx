import { CalendarClock } from "lucide-react";
import type { Obligation } from "@/domain/engine";
import { Money, SourceBadge } from "@/components/primitives";
import { formatRelativeDate } from "@/lib/format";
import { DEMO_NOW } from "@/lib/demo-clock";

/** Upcoming payments within the horizon (liabilities + recurring bills). */
export function ObligationsList({ items }: { items: Obligation[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((o) => (
        <li key={o.id} className="flex items-center gap-3 py-2.5">
          <span className="rounded-lg bg-surface-muted p-2 text-muted" aria-hidden>
            <CalendarClock size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-text">{o.label}</span>
              <SourceBadge source={o.source} />
            </div>
            <span className="text-xs text-muted">{formatRelativeDate(o.dueDate, DEMO_NOW)}</span>
          </div>
          <Money amount={o.amount} className="shrink-0 text-sm font-semibold" />
        </li>
      ))}
    </ul>
  );
}
