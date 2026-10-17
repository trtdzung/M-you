"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A user bubble that answered a `clarify_options` card (`AgentClarifyOptionsCard`)
 * — collapsed to "Đã trả lời" so a chain of several clarify questions doesn't turn
 * into a wall of near-identical bubbles, with an expand toggle to see the exact
 * text that was actually sent to the agent (matching what AskUserQuestion shows
 * back here: the compact answered state, and the real answer on demand).
 */
export function ClarifyAnswerBubble({ text, expanded, onToggle }: { text: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="brand-gradient flex max-w-[85%] flex-col items-end gap-1 rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm text-white"
    >
      <span className="flex items-center gap-1">
        Đã trả lời
        <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
      </span>
      {expanded && <span className="text-right text-[13px] text-white/90">{text}</span>}
    </button>
  );
}
