import { HandCoins } from "lucide-react";
import { formatVnd } from "@/lib/format";

/**
 * The durable "Cần bù thủ công" notice on a jar card (RT-fix C5) — a jar whose
 * post-rebalance remaining is still negative. U15: the copy promises an action,
 * so it carries one: "Chia lại hạn mức" opens the allocation sheet where the user
 * moves hạn mức from another jar (or accepts the overspend by closing it). Moves
 * no real money (invariant #3). `onCover` absent → text-only (no dead button).
 */
export function ManualCoverNotice({ shortfall, onCover }: { shortfall: number; onCover?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-row border border-warning/40 bg-warning-soft/50 px-3 py-2" role="status">
      <HandCoins size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-warning">Cần bù thủ công</p>
        <p className="text-[11px] text-warning">
          Hũ đang vượt hạn mức {formatVnd(shortfall)} chưa được bù. Rót thêm từ hũ khác hoặc chấp nhận vượt.
        </p>
        {onCover && (
          <button
            type="button"
            onClick={onCover}
            className="mt-1.5 inline-flex min-h-[32px] items-center rounded-full bg-surface px-3 text-[12px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Chia lại hạn mức
          </button>
        )}
      </div>
    </div>
  );
}
