import type { LucideIcon } from "lucide-react";
import { formatVndCompact } from "@/lib/format";

/**
 * One jar's envelope card for the Tổng quan row: the jar's accent colour with
 * white text, an "ĐANG DÙNG" badge when the jar has spending this period, and
 * "còn lại trong hũ" = `remaining` (hạn mức/nạp − đã tiêu, from the engine). A
 * jar with no limit and no allocation shows "Chưa có số dư" — never a fabricated
 * 0₫ (invariant #6). All numbers come from `Financials.jarEnvelope`; this card
 * never computes.
 *
 * A hũ is a money container: you cannot spend it below empty, so the balance is
 * floored at 0 here — an overspend is shown as a separate "đã vượt X" note, never
 * as a negative "còn lại" (which reads as nonsense for a jar). Tapping the card
 * opens the real jar view (Ngân sách) via `onOpen`.
 */
export function JarEnvelopeCard({
  label,
  accent,
  remaining,
  inUse,
  Icon,
  onOpen,
}: {
  label: string;
  accent: string;
  /** "còn lại trong hũ"; `null` = chưa đặt hạn mức & chưa nạp. Floored at 0 for display; the raw value may be negative (overspent). */
  remaining: number | null;
  inUse: boolean;
  Icon: LucideIcon;
  /** Open the real jar view (Ngân sách tab). Card is a button when provided. */
  onOpen?: () => void;
}) {
  const overspent = remaining !== null && remaining < 0;
  // A jar cannot hold negative money — floor the displayed balance at 0.
  const balance = remaining === null ? null : Math.max(0, remaining);
  const overBy = overspent ? -(remaining as number) : 0;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[13px] font-semibold leading-tight">{label}</span>
        <Icon size={18} className="shrink-0 opacity-90" aria-hidden />
      </div>

      <div className="flex flex-col gap-1">
        {inUse && (
          <span className="inline-flex w-fit items-center rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Đang dùng
          </span>
        )}
        <div>
          <div className="text-[18px] font-bold leading-tight">
            {balance === null ? "Chưa có số dư" : formatVndCompact(balance)}
          </div>
          <div className="text-[11px] text-white/85">
            {overspent ? `đã vượt ${formatVndCompact(overBy)}` : "còn lại trong hũ"}
          </div>
        </div>
      </div>
    </>
  );

  const className =
    "flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card p-4 text-left text-white shadow-card";

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
