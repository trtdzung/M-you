import type { BudgetLine, BudgetStatus } from "@/domain/engine";
import { Money } from "@/components/primitives";
import { cn } from "@/lib/cn";

const STATUS_STYLE: Record<BudgetStatus, { bar: string; text: string; label: string }> = {
  ok: { bar: "bg-positive", text: "text-positive", label: "Trong hạn mức" },
  near: { bar: "bg-warning", text: "text-warning", label: "Sắp vượt" },
  over: { bar: "bg-negative", text: "text-negative", label: "Vượt hạn mức" },
};

/** Per-category budget usage with pressure state. */
export function BudgetList({ lines }: { lines: BudgetLine[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {lines.map((line) => {
        const style = STATUS_STYLE[line.status];
        const pct = Math.min(100, Math.round(line.pct * 100));
        return (
          <li key={line.categoryId}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-text">{line.label}</span>
              <span className={cn("text-xs font-medium", style.text)}>{style.label}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>
                <Money amount={line.used} className="text-text" /> / <Money amount={line.limit} />
              </span>
              <span>{line.daysLeft > 0 ? `Còn ${line.daysLeft} ngày` : "Đã hết kỳ"}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
