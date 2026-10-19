import { cn } from "@/lib/cn";

/** Wizard progress (≤ 5 steps): segmented bar + "Bước 2/4 · Tên bước". */
export function StepProgress({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  const total = Math.min(5, steps.length);
  const index = Math.min(Math.max(0, current), total - 1);
  return (
    <div className={cn("flex flex-col gap-1.5", className)} aria-label={`Bước ${index + 1} trên ${total}: ${steps[index]}`}>
      <div className="flex gap-1.5" aria-hidden>
        {steps.slice(0, total).map((step, i) => (
          <span key={step} className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-surface-muted")} />
        ))}
      </div>
      <p className="text-[12px] leading-4 text-muted">
        Bước {index + 1}/{total} · <span className="font-semibold text-text">{steps[index]}</span>
      </p>
    </div>
  );
}
