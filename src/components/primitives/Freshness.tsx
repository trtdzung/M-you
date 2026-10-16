import { cn } from "@/lib/cn";
import { DEMO_NOW } from "@/lib/demo-clock";

/** Relative-time freshness label, e.g. "Cập nhật 3 giờ trước". */
export function Freshness({
  at,
  prefix = "Cập nhật",
  className,
}: {
  at: string | null | undefined;
  prefix?: string;
  className?: string;
}) {
  const label = at ? relative(at) : "chưa rõ";
  return <span className={cn("text-xs text-muted", className)}>{prefix} {label}</span>;
}

function relative(iso: string, now: Date = DEMO_NOW): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "chưa rõ";
  const diffMs = now.getTime() - then;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.round(days / 30);
  return `${months} tháng trước`;
}
