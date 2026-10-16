"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ChatBubble {
  id: string;
  role: "user" | "agent";
  text: string;
}

const GREETING = "Xin chào 👋 Mình là M-Your. Bạn cần hỏi gì về tài chính của mình?";
const PLACEHOLDER_REPLY = "Cảm ơn bạn đã nhắn tin! M-Your đang được hoàn thiện, câu trả lời thật sẽ sớm có mặt.";

/**
 * Floating "M-Your" chat button + full-screen overlay for `/pfm/*`, mounted via
 * the `PhoneShell` `fab` slot so it stays visible above the bottom nav on every
 * PFM tab without overlapping the center ＋ FAB. UI-only mock for now — no AI
 * backend wired — so sending a message appends a static placeholder reply.
 * `messages`/`open` are owned here (not remounted on tab switches) so "xoá hội
 * thoại" has something to clear across the session.
 */
export function MYourWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const idRef = useRef(0);
  const titleId = useId();

  function send() {
    const text = input.trim();
    if (!text) return;
    const userId = `m${++idRef.current}`;
    const replyId = `m${++idRef.current}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text },
      { id: replyId, role: "agent", text: PLACEHOLDER_REPLY },
    ]);
    setInput("");
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <div className="shell-fab pointer-events-none absolute right-5 z-20 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở trợ lý M-Your"
          className="pointer-events-auto flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-surface shadow-nav ring-2 ring-white/80 transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon_agent.png" alt="" className="h-full w-full object-cover" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="absolute inset-0 z-30 flex flex-col bg-surface"
        >
          <header className="shadow-card flex shrink-0 items-center gap-2.5 px-4 py-3">
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon_agent.png" alt="" className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted">
                Trợ lý Tài chính của bạn
              </p>
              <h2 id={titleId} className="text-base font-bold tracking-tight text-text">
                M-Your
              </h2>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([])}
                aria-label="Xóa hội thoại"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Trash2 size={19} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-3">
              {messages.length === 0 && (
                <div className={cn("shadow-card max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-muted px-3.5 py-2.5 text-sm text-text")}>
                  {GREETING}
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                      m.role === "user"
                        ? "brand-gradient rounded-br-sm text-white"
                        : "shadow-card rounded-bl-sm bg-surface-muted text-text",
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shadow-nav shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+var(--safe-area-bottom))]">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                placeholder="Nhắn tin cho M-Your…"
                className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus:bg-surface"
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim()}
                aria-label="Gửi"
                className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
