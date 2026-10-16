import { AlertTriangle } from "lucide-react";
import type { JarConfig } from "@/domain/models";
import { Money, SourceBadge, type Source } from "@/components/primitives";
import { cn } from "@/lib/cn";

/**
 * Live allocation total against the resolved income (F5 — income value + source
 * shown next to the meter). Over-allocation is a WARNING, never a block (KISS):
 * percent jars over 100%, or (when income is known) total allocated VND over
 * income. Income unknown → percent-only meter with an "đặt thu nhập" nudge.
 */
export function AllocationMeter({
  config,
  income,
}: {
  config: JarConfig;
  income: { value: number | "unknown"; source: Source };
}) {
  const percentSum = config.jars
    .filter((j) => j.allocation.mode === "percent")
    .reduce((s, j) => s + j.allocation.value, 0);
  const amountSum = config.jars
    .filter((j) => j.allocation.mode === "amount")
    .reduce((s, j) => s + j.allocation.value, 0);

  const known = income.value !== "unknown";
  const allocatedVnd = known
    ? config.jars.reduce(
        (s, j) =>
          s + (j.allocation.mode === "percent"
            ? ((income.value as number) * j.allocation.value) / 100
            : j.allocation.value),
        0,
      )
    : null;

  const overPercent = percentSum > 100;
  const overIncome = allocatedVnd !== null && allocatedVnd > (income.value as number);
  const warn = overPercent || overIncome;

  const fill = Math.min(100, Math.max(0, Math.round(percentSum)));

  return (
    <div className="rounded-2xl bg-surface-muted/40 p-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-text">Tổng phân bổ</span>
        <span className={cn("font-semibold", overPercent ? "text-negative" : "text-text")}>
          {Math.round(percentSum)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn("h-full rounded-full", overPercent ? "bg-negative" : "bg-primary")}
          style={{ width: `${fill}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5">
          Thu nhập tháng: {known ? <Money amount={income.value as number} className="text-text" /> : "chưa xác định"}
          <SourceBadge source={income.source} />
        </span>
        {amountSum > 0 && (
          <span>
            Cố định: <Money amount={amountSum} className="text-text" />
          </span>
        )}
      </div>

      {warn && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {overPercent
            ? "Tổng phần trăm vượt 100% — phân bổ nhiều hơn thu nhập."
            : "Tổng phân bổ vượt thu nhập tháng."}
        </p>
      )}
      {!known && (
        <p className="mt-1 text-xs text-muted">Đặt thu nhập để quy đổi phần trăm sang số tiền.</p>
      )}
    </div>
  );
}
