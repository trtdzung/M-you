import { Money } from "@/components/primitives";
import { formatDate } from "@/lib/format";
import type { GoalLedgerEntry } from "../../model/types";
import { GOALS_COPY } from "../copy";

export function LedgerRow({ entry }: { entry: GoalLedgerEntry }) {
  const deposit = entry.kind === "deposit";
  return (
    <li className="flex items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-text">
          {deposit ? GOALS_COPY.detail.deposit : GOALS_COPY.detail.withdraw}
        </p>
        <p className="text-xs text-muted">{formatDate(entry.createdAt)}</p>
        {entry.note && <p className="mt-1 text-xs italic text-ink-soft">{entry.note}</p>}
      </div>
      <Money amount={entry.amount} sign={deposit ? "credit" : "debit"} showPlus className="font-semibold" />
    </li>
  );
}
