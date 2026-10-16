"use client";

import { ChatPanel } from "@/components/assistant/ChatPanel";
import { openerFromInsight } from "@/ai/proactive/openers";
import { useInsights } from "@/state/useInsights";

/**
 * `/assistant` — pure full-height chat. The warm chrome (app-bar, trust strip)
 * lives in `layout.tsx`; this page owns only the chat. `useInsights` is read
 * solely to seed one proactive opener from the top visible insight (respects
 * snooze/dismiss). All non-happy states are rendered inside `ChatPanel` so the
 * docked composer never disappears.
 */
export default function AssistantPage() {
  const { loading, error, visible } = useInsights();
  const opener = !loading && !error && visible.length > 0 ? openerFromInsight(visible[0]) : null;

  return (
    <div className="h-full">
      <ChatPanel opener={opener} loading={loading} error={error} />
    </div>
  );
}
