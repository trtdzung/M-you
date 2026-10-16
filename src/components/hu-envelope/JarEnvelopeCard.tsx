import type { LucideIcon } from "lucide-react";
import { formatVndCompact } from "@/lib/format";

/**
 * One jar's envelope card for the Tổng quan row: the jar's accent colour with
 * white text, an "ĐANG DÙNG" badge when funded this period, and "còn lại trong
 * hũ" = `remaining` (nạp − đã tiêu, from the engine). A jar not funded this
 * period shows "Chưa có số dư" — never a fabricated 0₫ (invariant #6). All
 * numbers come from `Financials.jarEnvelope`; this card never computes.
 */
export function JarEnvelopeCard({
  label,
  accent,
  remaining,
  inUse,
  Icon,
}: {
  label: string;
  accent: string;
  /** "còn lại trong hũ"; `null` = chưa nạp kỳ này. May be negative (overspent). */
  remaining: number | null;
  inUse: boolean;
  Icon: LucideIcon;
}) {
  const overspent = remaining !== null && remaining < 0;
  return (
    <div
      className="flex min-h-[124px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-card p-4 text-white shadow-card"
      style={{ backgroundColor: accent }}
    >
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
            {remaining === null ? "Chưa có số dư" : formatVndCompact(remaining)}
          </div>
          <div className="text-[11px] text-white/85">{overspent ? "đã vượt hũ" : "còn lại trong hũ"}</div>
        </div>
      </div>
    </div>
  );
}
