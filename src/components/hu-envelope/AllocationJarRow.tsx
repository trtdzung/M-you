import { formatVndCompact } from "@/lib/format";

/**
 * One jar's row inside the "Chia ngay" sheet: colour dot + label + its CURRENT
 * số dư as reference text, and a VND input for the amount to ADD to this jar's
 * balance. The input OPENS AT 0 (blank with a "0" placeholder): the user types how
 * much to hand this jar from the leftover, not its full new total. Presentation + a
 * controlled input only; the cap/guardrail logic lives in `AllocationSheet`.
 */
export function AllocationJarRow({
  label,
  accent,
  currentBalance,
  value,
  onChange,
}: {
  label: string;
  accent: string;
  /** The jar's current SỐ DƯ (`balance`); `null` = chưa có số dư. */
  currentBalance: number | null;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{label}</div>
        <div className="text-[11px] text-muted">
          {currentBalance === null ? "chưa có số dư" : `số dư hiện tại ${formatVndCompact(currentBalance)}`}
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
        aria-label={`Cộng thêm vào hũ ${label}`}
        className="h-11 w-28 rounded-xl border border-border bg-surface px-3 text-right text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      />
    </div>
  );
}
