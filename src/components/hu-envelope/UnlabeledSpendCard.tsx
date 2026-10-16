import { Tags } from "lucide-react";
import { formatVndCompact } from "@/lib/format";

/**
 * "Chưa gắn nhãn" card: current-month spend that left CASA without a category
 * (never routed to a jar). Count + compact amount, with a "Gắn nhãn →" CTA that
 * opens the labeling sheet. Both numbers come from `Financials.unlabeled`
 * (engine-derived, invariant #1).
 *
 * The card ALWAYS renders (the row mounts it whenever the engine provides
 * `unlabeled`), so it has an explicit `count === 0` empty branch: the "chờ chia"
 * jar stays visible with a neutral "đã gắn nhãn hết" read and a disabled CTA
 * (nothing to label), instead of disappearing.
 *
 * Deliberately distinct from "Chờ phân bổ" (a BUDGET-lens number): this is a
 * DATA-QUALITY prompt — spend that needs a label — so it carries its own icon
 * and warning accent (only when there IS unlabeled spend) to keep the two reads
 * apart at a glance.
 */
export function UnlabeledSpendCard({
  count,
  amount,
  onOpen,
}: {
  count: number;
  amount: number;
  onOpen: () => void;
}) {
  const empty = count === 0;
  return (
    <div
      className={
        empty
          ? "flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card border border-border bg-surface-tint p-4 shadow-card"
          : "flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card border border-dashed border-warning/50 bg-warning-soft p-4 shadow-card"
      }
    >
      <div>
        <div className="flex items-center gap-1 text-[13px] font-semibold text-text">
          <Tags size={14} className={empty ? "text-muted" : "text-warning"} aria-hidden />
          Chưa gắn nhãn
        </div>
        <div className="mt-1 text-[18px] font-bold text-text">{formatVndCompact(amount)}</div>
        <div className="text-[11px] text-muted">
          {empty ? "Đã gắn nhãn hết" : `${count} giao dịch chưa vào hũ`}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={empty}
        className={
          empty
            ? "inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-muted"
            : "inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
        }
      >
        Gắn nhãn →
      </button>
    </div>
  );
}
