import { cn } from "@/lib/cn";

/**
 * Renders a genuinely-unknown value (invariant #6: missing stays unknown, never
 * silently 0₫). Use this everywhere a number is not computable — a dash for
 * inline slots, or the full "Chưa xác định" label where the empty state needs to
 * read as intentional. NEVER substitute `0₫` for missing data.
 */
export function UnknownValue({
  label = false,
  className,
}: {
  /** When true, renders "Chưa xác định" instead of the compact "—" dash. */
  label?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("text-muted", className)}>{label ? "Chưa xác định" : "—"}</span>
  );
}
