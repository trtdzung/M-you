import { ArrowRight } from "lucide-react";
import { formatVndCompact } from "@/lib/format";
import type { Amount } from "@/domain/engine";

/**
 * "Chờ phân bổ" card: the CASA money no jar's hạn mức claims yet
 * (`CASA − Σ budgetLimit`) — the LIMIT lens, so this number is exactly the
 * "Còn lại để chia" the "Chia ngay →" CTA opens onto (`AllocationSheet`) and
 * exactly what the cap accepts (`fitsCasaCap`). It is deliberately NOT the
 * transfer picker's "Chưa phân bổ" (`CASA − Σ spendable`), which frees đã-chi
 * money back into the pool and would promise headroom the sheet rejects.
 * The amount comes from `Financials.jarEnvelope.pending` (engine-derived); an
 * "unknown" amount (no CASA account) renders "—", never 0₫ (invariant #6).
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
          {known ? "số dư chưa đặt vào hũ nào" : "chưa có số dư tài khoản"}
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
