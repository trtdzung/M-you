import { Empty } from "@/components/states";
import type { GoalLedgerEntry } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { LedgerRow } from "./LedgerRow";

/** Ledger entries, newest first (as the API returns them). */
export function LedgerHistory({ entries }: { entries: GoalLedgerEntry[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-text">{GOALS_COPY.detail.history}</h3>
      {entries.length === 0 ? (
        <Empty title={GOALS_COPY.detail.historyEmpty} description="" />
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <LedgerRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
