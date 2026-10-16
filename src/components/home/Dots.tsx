import { cn } from "@/lib/cn";

/** Dot pagination cho carousel — dot active kéo dài màu cam (khớp ref `1.2`). */
export function Dots({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 pt-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200 ease-out",
            i === active ? "w-5 bg-primary" : "w-1.5 bg-primary/25",
          )}
        />
      ))}
    </div>
  );
}
