import { AlertTriangle, CheckCircle2, MoreVertical, Plus } from "lucide-react";
import { Card } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { PressureRow, type PressureVariant } from "./PressureRow";
import { JarRebalanceLines } from "./JarRebalanceLines";
import { ManualCoverNotice } from "./ManualCoverNotice";
import { jarNeedsManualTopUp } from "@/domain/engine";
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
 * The verdict is post-rebalance (D24/L13/U18): the bar reads đã tiêu vs the
 * EFFECTIVE limit (hạn mức + bù/chuyển), and a jar whose overspend was covered
 * shows "Đã bù", never "Vượt hạn mức … Đã vượt".
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
  // RT-fix (C5): a jar over-budget with no covering rebalance is the DERIVED
  // "cần bù thủ công" state — surfaced durably until funded or accepted.
  const needsManualTopUp = jarNeedsManualTopUp(line.remaining);
  // Spent past its own limit but a rebalance brought it back to ≥ 0 → covered.
  const overspend = line.limit !== null ? line.spent - line.limit : 0;
  const covered = !unset && overspend > 0 && !needsManualTopUp;
  const warn = !covered && (line.status === "near" || line.status === "over");
  const statusLabel = covered ? "Đã bù vượt hạn mức" : warn ? STATUS_COPY[line.status as "near" | "over"] : undefined;
  const net = line.rebalanceNet ?? 0;
  const shownLimit = unset ? null : (line.effectiveLimit ?? line.limit);
  const limitNote =
    !unset && net !== 0 && line.limit !== null
      ? `Hạn mức ${formatVnd(line.limit)} ${net > 0 ? "+ bù" : "− chuyển"} ${formatVnd(Math.abs(net))}`
      : null;
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
            rightLabel={limitNote}
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
        {covered && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
            <CheckCircle2 size={13} aria-hidden />
            Đã bù {formatVnd(overspend)}
          </span>
        )}
        {warn && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            <AlertTriangle size={13} aria-hidden />
            {line.status === "over" ? "Đã vượt" : "Sắp chạm"}
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
