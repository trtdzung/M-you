import type { CategorySpend } from "@/domain/engine";
import { Money } from "@/components/primitives";

/** Horizontal category-contribution bars (CSS-based, mobile-friendly). */
export function CategoryBars({ items }: { items: CategorySpend[] }) {
  const max = items.reduce((m, i) => Math.max(m, i.amount), 0);
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.categoryId}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-text">{item.label}</span>
            <span className="flex items-center gap-2 text-muted">
              <span className="text-xs">{Math.round(item.share * 100)}%</span>
              <Money amount={item.amount} className="text-text" />
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${max > 0 ? (item.amount / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
