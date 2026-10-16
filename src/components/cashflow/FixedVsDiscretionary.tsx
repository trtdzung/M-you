import { Money } from "@/components/primitives";

/** Split of expense into fixed (recurring) vs discretionary. */
export function FixedVsDiscretionary({ fixed, discretionary }: { fixed: number; discretionary: number }) {
  const total = fixed + discretionary;
  const fixedPct = total > 0 ? Math.round((fixed / total) * 100) : 0;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full bg-primary" style={{ width: `${fixedPct}%` }} aria-hidden />
        <div className="h-full bg-warning" style={{ width: `${100 - fixedPct}%` }} aria-hidden />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <span className="text-muted">Cố định</span>
          <Money amount={fixed} className="ml-auto font-medium text-text" />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden />
          <span className="text-muted">Linh hoạt</span>
          <Money amount={discretionary} className="ml-auto font-medium text-text" />
        </div>
      </div>
    </div>
  );
}
