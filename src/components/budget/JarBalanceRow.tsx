import { Money } from "@/components/primitives";
import { cn } from "@/lib/cn";

/**
 * The SỐ DƯ line of a jar card — the running balance, deliberately separate from
 * the đã-chi/hạn-mức bar above it (plan 260923: limit = monthly plan, balance =
 * money in the jar, carried across months). An inter-jar transfer moves this
 * number and nothing else; it is not itemised on the card — the "Điều chỉnh hũ"
 * rows in Giao dịch carry it.
 *
 * A negative balance (hết tiền) is shown as such in `text-negative` — the same
 * figure `JarEnvelopeCard` shows on Tổng quan; `ManualCoverNotice` below carries
 * the action. `null` (no deposit yet, or a month before the jar existed) reads
 * "Chưa có số dư", never 0 (invariant #6); in the current month it offers
 * "Chia ngay" (`onAllocate`) to fund the jar from "Chờ phân bổ".
 *
 * Presentation-only: `balance` is `JarBudgetLine.balance`, computed by the
 * engine (invariant #2).
 */
export function JarBalanceRow({
  balance,
  onAllocate,
}: {
  balance: number | null;
  /** Current month only: open the allocation sheet for an unfunded jar. */
  onAllocate?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted">
        Số dư{" "}
        {balance === null ? (
          <span className="ml-1 font-semibold text-text">Chưa có số dư</span>
        ) : (
          <Money amount={balance} className={cn("ml-1 font-semibold", balance < 0 ? "text-negative" : "text-text")} />
        )}
      </span>
      {balance === null && onAllocate && (
        <button
          type="button"
          onClick={onAllocate}
          className="inline-flex min-h-[32px] items-center rounded-full bg-surface-tint px-3 text-[12px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Chia ngay
        </button>
      )}
    </div>
  );
}
