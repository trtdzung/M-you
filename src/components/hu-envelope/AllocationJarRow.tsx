import { formatVndCompact } from "@/lib/format";

/**
 * One jar's row inside the "Chia ngay" sheet: colour dot + label + its CURRENT
 * hạn mức as reference text, and a VND input for the jar's NEW total limit. The
 * sheet divides the whole balance again, so the input OPENS EMPTY (0 renders as
 * a blank with a "0" placeholder) rather than prefilled with the current limit.
 * Presentation + a controlled input only; the cap/guardrail logic lives in
 * `AllocationSheet`.
 */
export function AllocationJarRow({
  label,
  accent,
  currentLimit,
  value,
  onChange,
}: {
  label: string;
  accent: string;
  /** The jar's current hạn mức (`budgetLimit`); `null` = chưa đặt. */
  currentLimit: number | null;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{label}</div>
        <div className="text-[11px] text-muted">
          {currentLimit === null ? "chưa đặt hạn mức" : `hạn mức hiện tại ${formatVndCompact(currentLimit)}`}
        </div>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={100_000}
        value={value === 0 ? "" : value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
        }}
        placeholder="0"
        aria-label={`Hạn mức mới cho hũ ${label}`}
        className="h-11 w-28 rounded-xl border border-border bg-surface px-3 text-right text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      />
    </div>
  );
}
