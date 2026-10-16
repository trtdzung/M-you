import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Month-over-month delta. `goodWhenDown` flips the color semantics (e.g. for
 * expense, a decrease is good). Renders "—" when there is no comparison base.
 */
export function DeltaBadge({
  current,
  previous,
  goodWhenDown = false,
  className,
}: {
  current: number;
  previous: number;
  goodWhenDown?: boolean;
  className?: string;
}) {
  if (previous === 0) {
    return <span className={cn("inline-flex items-center gap-0.5 text-xs text-muted", className)}><Minus size={12} /> mới</span>;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  const good = (up && !goodWhenDown) || (down && goodWhenDown);
  const color = up || down ? (good ? "text-positive" : "text-negative") : "text-muted";
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", color, className)}>
      <Icon size={12} />
      {Math.abs(pct).toFixed(0)}% so với tháng trước
    </span>
  );
}
