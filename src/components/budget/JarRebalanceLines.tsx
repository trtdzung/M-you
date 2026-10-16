import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { REBALANCE_CATEGORY_LABEL } from "@/domain/models";
import type { Transaction } from "@/domain/models";
import { POOL_DONOR_ID, POOL_DONOR_LABEL } from "@/domain/engine/jar-funding";

/**
 * Read-only rebalance pseudo-lines for ONE jar (plan 260918-1120, Phase 02). Each
 * `REBALANCE_CATEGORY`-tagged txn touching this jar renders as a single row:
 *   - "← Nhận X từ <donor>"  when this jar is the `toJarId`   (nhận, +)
 *   - "→ Chuyển X sang <target>" when this jar is the `fromJarId` (cho, −)
 *
 * Presentational only. These NEVER change the jar's `spent`/đã tiêu — that figure
 * stays `jarBudget.lines[].spent` (spend-vs-limit truth); the rebalance is already
 * excluded from thu/chi in the engine (invariant #6). Labelled internal (Điều
 * chỉnh hũ) and carrying `origin` provenance (auto ≠ user-typed, invariant #5).
 */
export function JarRebalanceLines({
  huId,
  rebalances,
  labelOf,
}: {
  huId: string;
  rebalances: Transaction[];
  /** Resolve a jar id (or the `"pool"` sentinel) to its display label. */
  labelOf: (jarId: string) => string;
}) {
  const lines = rebalances.filter(
    (t) => t.rebalance && (t.rebalance.toJarId === huId || t.rebalance.fromJarId === huId),
  );
  if (lines.length === 0) return null;

  return (
    <ul
      className="flex flex-col gap-1.5 border-t border-border pt-2.5"
      aria-label={`${REBALANCE_CATEGORY_LABEL} — ${huId}`}
    >
      {lines.map((t) => {
        const meta = t.rebalance!;
        const received = meta.toJarId === huId;
        const otherLabel = labelOf(received ? meta.fromJarId : meta.toJarId);
        return (
          <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted">
              {received ? (
                <ArrowDownLeft size={13} className="shrink-0 text-positive" aria-hidden />
              ) : (
                <ArrowUpRight size={13} className="shrink-0 text-negative" aria-hidden />
              )}
              <span className="truncate">
                {received ? `Nhận từ ${otherLabel}` : `Chuyển sang ${otherLabel}`}
              </span>
              {meta.origin === "auto" && (
                <span className="shrink-0 rounded bg-surface-muted px-1 py-0.5 text-[10px] font-medium text-muted">
                  tự động
                </span>
              )}
            </span>
            <span
              className={cn(
                "shrink-0 font-semibold tabular-nums",
                received ? "text-positive" : "text-negative",
              )}
            >
              {received ? "+" : "−"}
              {formatVnd(t.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Label resolver shared by the jar cards: real jar label, the pool sentinel
 * ("Chưa phân bổ" — a pool cover leg reads "Nhận từ Chưa phân bổ"), or — for a
 * jar no longer in config — "hũ đã xoá" (never a raw id).
 */
export function makeJarLabelResolver(lines: { huId: string; label: string }[]) {
  return (jarId: string) =>
    jarId === POOL_DONOR_ID ? POOL_DONOR_LABEL : (lines.find((l) => l.huId === jarId)?.label ?? "hũ đã xoá");
}
