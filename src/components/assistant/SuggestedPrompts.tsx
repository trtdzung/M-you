// DEFERRED: unused after the 3-tab reformat — it was a nav-Link starter that
// duplicated the Composer's STARTER_PROMPTS (red-team #4). The `/assistant`
// empty-state uses InsightsView + Composer starters instead. See
// plans/260909-2254-pfm-3tab-reformat/ and plans/project-backlog.md.
import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { SUGGESTED_PROMPTS } from "@/ai/proactive/openers";

/**
 * Gợi ý câu hỏi — tappable seeds that route INTO the dedicated copilot chat
 * (`/assistant`). Reuses the shipped static seeds from `openers.ts` (no new
 * proactive engine, YAGNI). Rendered as links, never auto-navigating (red-team
 * #15) — only a user tap moves the user. Empty seed list renders nothing.
 */
export function SuggestedPrompts() {
  if (SUGGESTED_PROMPTS.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2" aria-label="Gợi ý câu hỏi cho trợ lý">
      {SUGGESTED_PROMPTS.map((prompt) => (
        <li key={prompt}>
          <Link
            href="/assistant"
            className="flex items-center gap-2.5 rounded-2xl bg-surface px-4 py-3 text-sm text-text shadow-card transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <MessageCircleQuestion
              size={18}
              strokeWidth={2}
              className="shrink-0 text-primary"
              aria-hidden
            />
            <span>{prompt}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
