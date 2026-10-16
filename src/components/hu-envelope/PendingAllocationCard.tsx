import { ArrowRight } from "lucide-react";
import { formatVndCompact } from "@/lib/format";
import type { Amount } from "@/domain/engine";

/**
 * "Chờ phân bổ" card: the CASA balance not yet committed to any jar's monthly
 * LIMIT (budget headroom = pool − Σ budgetLimit), plus a "Chia ngay →" CTA that
 * opens the allocation sheet. The amount comes from `Financials.jarEnvelope.pending`
 * (engine-derived); an "unknown" amount (no CASA account) renders "—", never 0₫
 * (invariant #6).
 *
 * NOTE (label disambiguation): this is a BUDGET-lens number — how much CASA has
 * no hạn mức yet — and is deliberately distinct from the transfer sheet's
 * spendable-lens "Chưa phân bổ" pool (CASA − Σ còn-lại-các-hũ). The two answer
 * different questions, so the subtitle names the budget lens explicitly.
 */
export function PendingAllocationCard({
  amount,
  onAllocate,
}: {
  amount: Amount;
  onAllocate: () => void;
}) {
  const known = amount !== "unknown";
  return (
    <div className="flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card border border-dashed border-border bg-surface-tint p-4 shadow-card">
      <div>
        <div className="text-[13px] font-semibold text-text">Chờ phân bổ</div>
        <div className="mt-1 text-[18px] font-bold text-text">{known ? formatVndCompact(amount) : "—"}</div>
        <div className="text-[11px] text-muted">
          {known ? "chưa đặt vào hạn mức hũ" : "chưa có số dư tài khoản"}
        </div>
      </div>

      <button
        type="button"
        onClick={onAllocate}
        disabled={!known || amount <= 0}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-primary disabled:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Chia ngay <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
