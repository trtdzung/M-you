"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Sheet, Money } from "@/components/primitives";
import { Empty, SkeletonCard } from "@/components/states";
import { cn } from "@/lib/cn";
import { useFinancials } from "@/state/useFinancials";
import { useJarConfig } from "@/state/jars";
import {
  groupSpendingByJar,
  monthPeriodFromKey,
  KHAC_JAR_ID,
  type JarSpendGroup,
} from "@/domain/engine";
import { monthKeyLabel } from "@/lib/demo-clock";
import { categoryColor, CATEGORY_COLOR_FALLBACK } from "@/lib/category-colors";
import { SpendingDonut, type JarDonutDatum } from "./SpendingDonut";

/** Representative color key for a jar group (first category, else grey). */
function jarColor(g: JarSpendGroup): string {
  return g.jarId === KHAC_JAR_ID ? CATEGORY_COLOR_FALLBACK : categoryColor(g.categories[0]?.categoryId ?? g.jarId);
}

function toDonutData(groups: JarSpendGroup[]): JarDonutDatum[] {
  return groups.map((g) => ({
    id: g.jarId,
    label: g.label,
    amount: g.amount,
    colorKey: g.categories[0]?.categoryId ?? g.jarId,
  }));
}

/**
 * Báo cáo chi tiêu chi tiết (overlay mở từ Tổng quan): donut lớn nhóm theo hũ +
 * breakdown mở rộng ra danh mục con. Mọi số lấy thẳng từ engine
 * (`groupSpendingByJar`) — không bịa, danh mục lẻ rơi vào "Khác" (H4). Chỉ trình
 * bày; không tính toán tài chính ở đây.
 */
export function SpendingReport({ monthKey, onClose }: { monthKey: string; onClose: () => void }) {
  const { loading, error, financials, transactions } = useFinancials();
  const { config } = useJarConfig();

  const groups = useMemo(() => {
    if (!financials) return [];
    return groupSpendingByJar(config, transactions, monthPeriodFromKey(monthKey));
  }, [config, transactions, financials, monthKey]);

  const total = groups.reduce((s, g) => s + g.amount, 0);

  return (
    <Sheet title="Báo cáo chi tiêu" description={`${monthKeyLabel(monthKey)} · theo hũ`} onClose={onClose}>
      {error ? (
        <p role="alert" className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-muted">
          Không tải được báo cáo. Thử lại sau.
        </p>
      ) : loading || !financials ? (
        <SkeletonCard className="h-64" />
      ) : groups.length === 0 ? (
        <Empty title="Chưa có chi tiêu kỳ này" description="Chọn tháng khác để xem báo cáo." />
      ) : (
        <div className="flex flex-col gap-5">
          <SpendingDonut data={toDonutData(groups)} height={220} />
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <JarBreakdownRow key={g.jarId} group={g} total={total} color={jarColor(g)} />
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

/** One expandable jar row: %, amount, chevron → its categories. */
function JarBreakdownRow({ group, total, color }: { group: JarSpendGroup; total: number; color: string }) {
  const [open, setOpen] = useState(false);
  const share = total > 0 ? group.amount / total : 0;
  const hasChildren = group.categories.length > 0;

  return (
    <li className="overflow-hidden rounded-2xl bg-surface-muted">
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasChildren}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 disabled:cursor-default"
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <span className="flex-1 truncate text-sm font-semibold text-text">{group.label}</span>
        <span className="text-xs text-muted">{Math.round(share * 100)}%</span>
        <Money amount={group.amount} className="text-sm font-semibold text-text" />
        {hasChildren && (
          <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        )}
      </button>
      {open && hasChildren && (
        <ul className="border-t border-border px-4 py-2">
          {group.categories.map((c) => (
            <li key={c.categoryId} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(c.categoryId) }} />
              <span className="flex-1 truncate text-muted">{c.label}</span>
              <Money amount={c.amount} className="font-medium text-text" />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
