"use client";

import { AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { SourceChips } from "./SourceChips";
import { WhatIfChart } from "./WhatIfChart";
import type { UiMessage } from "./types";

/** One chat bubble — user or assistant — with text, charts and source chips. */
export function ChatMessage({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
          isUser
            ? "rounded-br-sm bg-primary text-white"
            : "rounded-bl-sm border border-border bg-surface text-text",
        )}
      >
        {message.degraded && !isUser && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted">
            <WifiOff size={11} /> Chế độ ngoại tuyến
          </span>
        )}

        {message.text ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>
        ) : (
          message.status === "streaming" &&
          !isUser && <TypingDots />
        )}

        {message.charts.map((chart, i) => (
          <WhatIfChart key={i} chart={chart} />
        ))}

        {!isUser && <SourceChips chips={message.chips} />}

        {message.error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-negative">
            <AlertTriangle size={13} /> {message.error}
          </p>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Đang soạn trả lời">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
