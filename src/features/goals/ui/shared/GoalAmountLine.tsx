import { formatVndCompact } from "@/lib/format";

/** "288 tr / 600 tr" */
export function GoalAmountLine({ current, target }: { current: number; target: number }) {
  return (
    <p className="text-sm tabular-nums text-text">
      <span className="font-semibold">{formatVndCompact(current)}</span>
      <span className="text-muted"> / {formatVndCompact(target)}</span>
    </p>
  );
}
