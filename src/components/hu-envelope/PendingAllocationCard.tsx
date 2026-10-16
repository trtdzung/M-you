import { ArrowRight } from "lucide-react";
import { formatVndCompact } from "@/lib/format";
import type { Amount } from "@/domain/engine";

/**
 * "Chờ phân bổ" card: the period income not yet split into jars + the exact
 * count of income transactions "chưa vào hũ", and a "Chia ngay →" CTA that opens
 * the allocation sheet. The amount comes from `Financials.jarEnvelope.pending`
 * (engine-derived); an "unknown" amount (no income data) renders "—", never 0₫
 * (invariant #6).
 */
export function PendingAllocationCard({
  amount,
  count,
  onAllocate,
}: {
  amount: Amount;
  count: number;
  onAllocate: () => void;
}) {
  const known = amount !== "unknown";
  return (
    <div className="flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card border border-dashed border-border bg-surface-tint p-4 shadow-card">
      <div>
        <div className="text-[13px] font-semibold text-text">Chờ phân bổ</div>
        <div className="mt-1 text-[18px] font-bold text-text">{known ? formatVndCompact(amount) : "—"}</div>
        <div className="text-[11px] text-muted">
          {known ? `${count} GD chưa vào hũ` : "chưa có dữ liệu thu"}
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
