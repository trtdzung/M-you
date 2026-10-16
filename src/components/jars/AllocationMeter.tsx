import { AlertTriangle } from "lucide-react";
import type { JarPartitionResult } from "@/domain/engine";
import { Money, SourceBadge } from "@/components/primitives";
import { cn } from "@/lib/cn";

const PALETTE = ["bg-primary", "bg-source-msb", "bg-source-self", "bg-source-estimated", "bg-warning", "bg-positive"];

/**
 * Stacked composition of the partition against the current balance: every
 * explicit jar's "chia" (earmark) plus the "Chưa phân bổ" residual, which by
 * construction sum to the balance. Over-allocation (Σ chia > số dư → residual
 * negative) is a WARNING, never a block (KISS): the explicit segments are capped
 * at 100% with an overflow marker and the copy says how much to trim, not
 * "còn −N". Unknown balance → a muted note (invariant #6, never a 0-bar).
 */
export function AllocationMeter({ partition }: { partition: JarPartitionResult }) {
  if (partition.status !== "ok" || partition.primaryBalance === null) {
    return (
      <div className="rounded-2xl bg-surface-muted/40 p-3 text-sm text-muted">
        Chưa xác định số dư tài khoản chính nên chưa thể chia hũ.
      </div>
    );
  }

  const balance = partition.primaryBalance;
  const explicit = partition.lines.filter((l) => !l.isResidual);
  const residual = partition.lines.find((l) => l.isResidual);
  const allocated = explicit.reduce((s, l) => s + l.earmark, 0);
  const residualEarmark = residual?.earmark ?? balance - allocated;
  const overAllocated = residualEarmark < 0;

  // Segment widths as a share of the balance. When over-allocated the explicit
  // earmarks exceed the balance, so normalise against the allocated total and
  // cap at 100% — the overflow is shown as a marker + warning, not a bar.
  const denom = overAllocated ? allocated : balance;
  const widthOf = (v: number) => (denom > 0 ? Math.max(0, Math.min(100, (v / denom) * 100)) : 0);

  return (
    <div className="rounded-2xl bg-surface-muted/40 p-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-text">Phân chia số dư</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Money amount={balance} className="text-text" /> số dư
          <SourceBadge source={partition.meta.source} />
        </span>
      </div>

      <div className={cn("relative flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted", overAllocated && "ring-1 ring-negative")}>
        {explicit.map((l, i) => (
          <div
            key={l.jarId}
            className={cn("h-full", PALETTE[i % PALETTE.length])}
            style={{ width: `${widthOf(l.earmark)}%` }}
            title={l.label}
          />
        ))}
        {!overAllocated && residualEarmark > 0 && (
          <div className="h-full bg-surface-muted" style={{ width: `${widthOf(residualEarmark)}%` }} title="Chưa phân bổ" />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>
          Đã chia <Money amount={allocated} className="text-text" /> / <Money amount={balance} />
        </span>
        {!overAllocated && (
          <span>
            còn <Money amount={residualEarmark} className="text-text" /> chưa phân bổ
          </span>
        )}
      </div>

      {overAllocated && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-negative">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Đã chia vượt số dư <Money amount={-residualEarmark} className="font-medium text-negative" />, giảm bớt một hũ nhé.
        </p>
      )}
    </div>
  );
}
