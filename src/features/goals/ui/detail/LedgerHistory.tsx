import type { GoalLedgerEntry } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { LedgerRow } from "./LedgerRow";

/** Ledger entries, newest first (as the API returns them). */
export function LedgerHistory({ entries }: { entries: GoalLedgerEntry[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="mb-2 text-[18px] font-semibold text-text">{GOALS_COPY.detail.history}</h3>
      {entries.length === 0 ? (
        <p className="text-[14px] leading-6 text-muted">Chưa có lịch sử. Bấm Góp để ghi nhận khoản đầu tiên.</p>
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
