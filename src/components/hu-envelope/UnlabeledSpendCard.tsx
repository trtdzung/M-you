import { Tags } from "lucide-react";
import { formatVndCompact } from "@/lib/format";

/**
 * "Chưa gắn nhãn" card: current-month spend that left CASA without a category
 * (never routed to a jar). Count + compact amount, with a "Gắn nhãn →" CTA that
 * opens the labeling sheet. Both numbers come from `Financials.unlabeled`
 * (engine-derived, invariant #1); the card is only mounted when `count > 0`, so
 * there is no "unknown"/0 branch here.
 *
 * Deliberately distinct from "Chờ phân bổ" (a BUDGET-lens number): this is a
 * DATA-QUALITY prompt — spend that needs a label — so it carries its own icon
 * and warning accent to keep the two reads apart at a glance.
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
  return (
    <div className="flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card border border-dashed border-warning/50 bg-warning-soft p-4 shadow-card">
      <div>
        <div className="flex items-center gap-1 text-[13px] font-semibold text-text">
          <Tags size={14} className="text-warning" aria-hidden />
          Chưa gắn nhãn
        </div>
        <div className="mt-1 text-[18px] font-bold text-text">{formatVndCompact(amount)}</div>
        <div className="text-[11px] text-muted">{count} giao dịch chưa vào hũ</div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
      >
        Gắn nhãn →
      </button>
    </div>
  );
}
