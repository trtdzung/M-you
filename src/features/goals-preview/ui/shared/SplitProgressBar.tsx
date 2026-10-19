import { formatVnd } from "@/features/goals-preview/format-money";
import { cn } from "@/lib/cn";
import { progressTrack } from "./styles";

/**
 * Progress toward target split into Tiền (cash) and Tài sản (assets) segments.
 * Optional `expectedPct` draws a tick where the plan says the customer should be.
 */
export function SplitProgressBar({
  cash,
  assets,
  target,
  expectedPct,
  showLegend = true,
  className,
}: {
  cash: number;
  assets: number;
  target: number;
  expectedPct?: number;
  showLegend?: boolean;
  className?: string;
}) {
  const safeTarget = Math.max(1, target);
  const cashPct = Math.max(0, Math.min(100, (cash / safeTarget) * 100));
  const assetPct = Math.max(0, Math.min(100 - cashPct, (assets / safeTarget) * 100));
  const totalPct = Math.round(((cash + assets) / safeTarget) * 100);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, totalPct)}
        aria-label={`Đã có ${totalPct}% mục tiêu: tiền ${formatVnd(cash)}, tài sản ${formatVnd(assets)}`}
        className={progressTrack}
      >
        <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${cashPct}%` }} />
        <div className="absolute inset-y-0 bg-source-self" style={{ left: `${cashPct}%`, width: `${assetPct}%` }} />
        {expectedPct !== undefined && expectedPct > 0 && expectedPct < 100 && (
          <div aria-hidden className="absolute inset-y-[-2px] w-0.5 bg-text/60" style={{ left: `${expectedPct}%` }} />
        )}
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] leading-4 text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
            Tiền {formatVnd(cash)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-source-self" />
            Tài sản {formatVnd(assets)}
          </span>
          <span className="ml-auto font-semibold text-text tabular-nums">{totalPct}%</span>
        </div>
      )}
    </div>
  );
}
