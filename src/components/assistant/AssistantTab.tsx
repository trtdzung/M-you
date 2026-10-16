// DEFERRED: unmounted in the 3-tab reformat — the Trợ lý tab was removed; the
// assistant now lives at the `/assistant` route (+ FAB), and the full insights
// feed is that page's empty-state doorway. Kept for reference; re-enable later.
// See plans/260909-2254-pfm-3tab-reformat/ and plans/project-backlog.md.
"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { Card } from "@/components/primitives";
import { InsightsView } from "@/components/insights/InsightsView";
import { SuggestedPrompts } from "./SuggestedPrompts";

/**
 * Trợ lý tab ("Làm gì tiếp?") — the answer to MSB's 4th product question. It
 * SURFACES the shipped copilot rather than re-embedding it (KISS): a prominent
 * entry into the dedicated `/assistant` chat, tappable suggested prompts, and
 * the relocated rule-based insights feed. Deep-links into other surfaces flow
 * through the `resolveIntentRoute` whitelist (used by copilot/P06 CTAs); this
 * tab never auto-navigates (red-team #15) — only user taps move the user.
 */
export function AssistantTab() {
  return (
    <div className="flex flex-col gap-6 pb-2">
      <CopilotEntry />

      <section aria-labelledby="troly-prompts-heading">
        <h3 id="troly-prompts-heading" className="mb-3 text-base font-semibold text-text">
          Gợi ý câu hỏi
        </h3>
        <SuggestedPrompts />
      </section>

      <section aria-labelledby="troly-feed-heading">
        <h3 id="troly-feed-heading" className="mb-3 text-base font-semibold text-text">
          Phát hiện cho bạn
        </h3>
        <InsightsView />
      </section>
    </div>
  );
}

/** Prominent, always-available doorway into the full copilot chat. */
function CopilotEntry() {
  return (
    <Card variant="hero" as="section" className="flex items-center gap-4">
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20"
        aria-hidden
      >
        <Sparkles size={26} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">Trợ lý MSB</p>
        <p className="mt-0.5 text-sm text-primary-fg/85">
          Hỏi về dòng tiền, chi tiêu, tài sản hay mục tiêu của bạn.
        </p>
      </div>
      <Link
        href="/assistant"
        aria-label="Mở trợ lý MSB"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <ArrowRight size={22} strokeWidth={2.5} />
      </Link>
    </Card>
  );
}
