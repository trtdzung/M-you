import { ShieldCheck } from "lucide-react";

/**
 * Compact, persistent trust strip pinned just under the app-bar. Replaces the big
 * disclosure card that used to sit in `page.tsx`; the full copy now lives behind
 * the app-bar ⓘ. Sits on the surface, never scrolls with the messages.
 */
export function AssistantTrustStrip() {
  return (
    <div className="flex shrink-0 items-center gap-1.5 bg-surface px-4 py-1.5 text-xs text-muted">
      <ShieldCheck size={14} className="shrink-0 text-primary" />
      <span>Chỉ đọc · không chuyển tiền · mỗi số kèm nguồn</span>
    </div>
  );
}
