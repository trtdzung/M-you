import { Loader2 } from "lucide-react";

/** Simple spinner + label loading state. */
export function Loading({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted"
    >
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
