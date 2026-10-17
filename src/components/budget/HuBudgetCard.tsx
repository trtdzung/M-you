import { AlertTriangle, MoreVertical, Plus } from "lucide-react";
import { Card } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { PressureRow, type PressureVariant } from "./PressureRow";
import { JarBalanceRow } from "./JarBalanceRow";
import { JarRebalanceLines } from "./JarRebalanceLines";
import { ManualCoverNotice } from "./ManualCoverNotice";
import { jarNeedsManualTopUp } from "@/domain/engine";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import type { JarBudgetLine } from "@/domain/engine/jar-budget";
import type { Transaction } from "@/domain/models";
import { categoryColor, CATEGORY_COLOR_FALLBACK } from "@/lib/category-colors";

const STATUS_COPY: Record<"near" | "over", string> = {
  near: "Gần chạm hạn mức",
  over: "Vượt hạn mức",
};

/**
 * One jar's budget card: đã tiêu / hạn mức progress (via the shared `PressureRow`,
 * DRY), a MoM delta, and a ⚠ warning when ≥80% used. Every number arrives from
 * `jar-budget.ts` — the card never computes (invariant #2). A jar with an UNSET
 * limit renders a muted "Chưa đặt hạn mức" row + a CTA, never a 0%/ok bar
 * (invariant #6). The kebab / CTA open the jar editor (phase 06).
 *
 * TWO AXES, shown separately. The bar reads đã tiêu vs the jar's OWN hạn mức (the
 * plan) — an inter-jar transfer never moves it, so a jar whose overspend was covered
 * still reads "Vượt hạn mức … Đã vượt". `JarBalanceRow` below carries the SỐ DƯ and
 * says where a transfer moved it; `ManualCoverNotice` fires off that balance going
 * negative, not off the verdict.
 */
export function HuBudgetCard({
  line,
  onEdit,
  onCover,
  rebalances = [],
  labelOf,
}: {
  line: JarBudgetLine;
  onEdit: (huId: string) => void;
  /** Opens the limit-reallocation surface for a "cần bù thủ công" jar (U15). */
  onCover?: (huId: string) => void;
  /**
   * The period's inter-jar rebalance txns (`financials.jarRebalances`). Rendered as
   * read-only "cho/nhận" pseudo-lines (Phase 02) — they never touch `line.spent`.
   */
  rebalances?: Transaction[];
  /** Resolves a jar id (or `"pool"`) to its label for the pseudo-lines. */
  labelOf?: (jarId: string) => string;
}) {
  const unset = line.limitState === "unset";
  const variant: PressureVariant = unset ? "unknown" : (line.status ?? "ok");
  // Balance axis — "cần bù thủ công" is a jar whose SỐ DƯ went negative (C5),
  // independent of whether it also broke its plan.
  const needsManualTopUp = jarNeedsManualTopUp(line.remaining);
  // Plan axis — spent past its OWN limit. A transfer that topped the balance back
  // up never erases this: the money was still spent over plan (U18 reversed).
  const overspend = line.limit !== null ? line.spent - line.limit : 0;
  const warn = line.status === "near" || line.status === "over";
  const statusLabel = warn ? STATUS_COPY[line.status as "near" | "over"] : undefined;
  const net = line.rebalanceNet ?? 0;
  const shownLimit = unset ? null : line.limit;
  const pctLabel = line.pct !== null ? `${Math.round(line.pct * 100)}%` : null;
  // Jar hue = its lead category's hue, so a jar reads the same colour on the card
  // and in the overview donut (grouped by jar). Empty jars fall back to neutral.
  const color = line.categoryIds[0] ? categoryColor(line.categoryIds[0]) : CATEGORY_COLOR_FALLBACK;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <PressureRow
            label={line.label}
            used={line.spent}
            limit={shownLimit}
            pct={line.pct}
            variant={variant}
            statusLabel={statusLabel}
            rightLabel={pctLabel}
            limitLabel={unset ? "Chưa đặt hạn mức" : undefined}
            accent={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
          />
        </div>
        <button
          type="button"
          onClick={() => onEdit(line.huId)}
          aria-label={`Tùy chọn hũ ${line.label}`}
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <MoreVertical size={18} aria-hidden />
        </button>
      </div>

      {!unset && <JarBalanceRow balance={line.remaining} net={net} />}

      <div className="flex items-center justify-between gap-2">
        {unset ? (
          <button
            type="button"
            onClick={() => onEdit(line.huId)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-surface-tint px-3 text-[13px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus size={14} aria-hidden /> Đặt hạn mức
          </button>
        ) : (
          <DeltaBadge current={line.spent} previous={line.prevSpent} goodWhenDown />
        )}
        {warn && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              line.status === "over" ? "text-negative" : "text-warning",
            )}
          >
            <AlertTriangle size={13} aria-hidden />
            {line.status === "over" ? `Đã vượt ${formatVnd(overspend)}` : "Sắp chạm"}
          </span>
        )}
      </div>

      {needsManualTopUp && (
        <ManualCoverNotice
          shortfall={Math.abs(line.remaining ?? 0)}
          onCover={onCover ? () => onCover(line.huId) : undefined}
        />
      )}

      {labelOf && (
        <JarRebalanceLines huId={line.huId} rebalances={rebalances} labelOf={labelOf} />
      )}
    </Card>
  );
}
