import { AlertTriangle, HandCoins, MoreVertical, Plus } from "lucide-react";
import { Card } from "@/components/primitives";
import { DeltaBadge } from "@/components/common/DeltaBadge";
import { PressureRow, type PressureVariant } from "./PressureRow";
import { JarRebalanceLines } from "./JarRebalanceLines";
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
 */
export function HuBudgetCard({
  line,
  onEdit,
  rebalances = [],
  labelOf,
}: {
  line: JarBudgetLine;
  onEdit: (huId: string) => void;
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
  const warn = line.status === "near" || line.status === "over";
  // RT-fix (C5): a jar over-budget with no covering rebalance is the DERIVED
  // "cần bù thủ công" state — an auto-fund that couldn't complete (uncoverable, or a
  // declined goal raid). Surfaced here durably (re-appears until the user funds it or
  // accepts the over-allocation), never a silent loss. Same condition Phase 07 reads.
  const needsManualTopUp = jarNeedsManualTopUp(line.remaining);
  // Jar hue = its lead category's hue, so a jar reads the same colour on the card
  // and in the overview donut (grouped by jar). Empty jars fall back to neutral.
  const color = line.categoryIds[0] ? categoryColor(line.categoryIds[0]) : CATEGORY_COLOR_FALLBACK;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <PressureRow
            label={line.label}
            used={line.spent}
            limit={unset ? null : line.limit}
            pct={line.pct}
            variant={variant}
            statusLabel={warn ? STATUS_COPY[line.status as "near" | "over"] : undefined}
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
        {warn && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            <AlertTriangle size={13} aria-hidden />
            {line.status === "over" ? "Đã vượt" : "Sắp chạm"}
          </span>
        )}
      </div>

      {needsManualTopUp && (
        <div className="flex items-start gap-2 rounded-row border border-warning/40 bg-warning-soft/50 px-3 py-2" role="status">
          <HandCoins size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-warning">Cần bù thủ công</p>
            <p className="text-[11px] text-warning">
              Hũ đang vượt hạn mức {formatVnd(Math.abs(line.remaining ?? 0))} chưa được bù. Rót thêm từ hũ khác hoặc chấp nhận vượt.
            </p>
          </div>
        </div>
      )}

      {labelOf && (
        <JarRebalanceLines huId={line.huId} rebalances={rebalances} labelOf={labelOf} />
      )}
    </Card>
  );
}
