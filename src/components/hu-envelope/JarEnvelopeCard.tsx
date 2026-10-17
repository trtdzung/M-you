import type { LucideIcon } from "lucide-react";
import { formatVndCompact } from "@/lib/format";

/**
 * One jar's envelope card for the Tổng quan row, in the jar's accent colour. Two
 * figures, kept apart (plan 260923):
 *  - SỐ DƯ — the running `balance` (ledger deposits/withdrawals, spend and
 *    rebalance since the jar's anchor). Negative = hết tiền, shown as such in
 *    `text-negative`; `null` → "Chưa có số dư", never a fabricated 0 (invariant #6).
 *  - HẠN MỨC gauge — "Đã chi Y / Z hạn mức" for the month (limit `null` →
 *    "Chưa đặt hạn mức", no bar).
 * All numbers come from `Financials.jarEnvelope`; this card never computes.
 * Tapping the card opens the real jar view (Ngân sách) via `onOpen`.
 */
export function JarEnvelopeCard({
  label,
  accent,
  balance,
  spent,
  limit,
  Icon,
  onOpen,
}: {
  label: string;
  accent: string;
  /** Số dư hũ; `null` = chưa có số dư. May be negative. */
  balance: number | null;
  /** Đã chi this month (limit axis). */
  spent: number;
  /** Hạn mức tháng; `null` = chưa đặt. */
  limit: number | null;
  Icon: LucideIcon;
  /** Open the real jar view (Ngân sách tab). Card is a button when provided. */
  onOpen?: () => void;
}) {
  // Bar width only (display); the verdict itself is the engine's `overLimit`.
  const fill = limit === null ? 0 : limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : spent > 0 ? 100 : 0;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[13px] font-semibold leading-tight">{label}</span>
        <Icon size={18} className="shrink-0 opacity-90" aria-hidden />
      </div>

      <div className="flex flex-col gap-1.5">
        <div>
          <div className="text-[11px] text-white/85">Số dư</div>
          {balance === null ? (
            <div className="text-[15px] font-bold leading-tight">Chưa có số dư</div>
          ) : balance < 0 ? (
            // Readable on any accent: the negative figure sits on a white chip.
            <div className="w-fit rounded-md bg-white px-1.5 text-[18px] font-bold leading-tight text-negative">
              {formatVndCompact(balance)}
            </div>
          ) : (
            <div className="text-[18px] font-bold leading-tight">{formatVndCompact(balance)}</div>
          )}
        </div>
        {limit !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/30" aria-hidden>
            <div className="h-full rounded-full bg-white" style={{ width: `${fill}%` }} />
          </div>
        )}
        <div className="text-[11px] text-white/85">
          {limit === null
            ? `Đã chi ${formatVndCompact(spent)} · Chưa đặt hạn mức`
            : `Đã chi ${formatVndCompact(spent)} / ${formatVndCompact(limit)} hạn mức`}
        </div>
      </div>
    </>
  );

  const className =
    "flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between gap-2 rounded-card p-4 text-left text-white shadow-card";

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Hũ ${label} — mở Ngân sách`}
        className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
        style={{ backgroundColor: accent }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={{ backgroundColor: accent }}>
      {content}
    </div>
  );
}
