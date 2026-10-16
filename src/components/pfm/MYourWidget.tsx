"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Loading, ErrorState } from "@/components/states";
import { usePersona } from "@/providers/context";
import {
  getChatHistory,
  sendChatMessage,
  deleteChatHistory,
  isChartUi,
  isTransferFormUi,
  type HistoryMessage,
  type UiPayload,
} from "@/lib/agent-api";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentChartCard } from "./AgentChartCard";
import { AgentTransferFormCard } from "./AgentTransferFormCard";

interface ChatBubble {
  id: string;
  role: "user" | "agent";
  text: string;
  ui?: UiPayload;
  error?: boolean;
}

const GREETING = "Xin chào 👋 Mình là M-Your. Bạn cần hỏi gì về tài chính của mình?";
const SEND_ERROR = "Không gửi được tin nhắn, vui lòng thử lại.";
const DELETE_LOCK_MS = 30_000;

function fromHistory(messages: HistoryMessage[]): ChatBubble[] {
  return messages.map((m, i) => ({
    id: `h${i}`,
    role: m.role === "user" ? "user" : "agent",
    text: m.content,
    ui: m.ui,
  }));
}

/**
 * Floating "M-Your" chat button + full-screen overlay for `/pfm/*`, mounted via
 * the `PhoneShell` `fab` slot so it stays visible above the bottom nav on every
 * PFM tab without overlapping the center ＋ FAB. Wired to the real agent
 * (`src/lib/agent-api.ts`, proxied through `src/app/api/agent/chat` so the
 * client never sees `AGENT_API_KEY`) — `cif` is the active persona's CIF.
 * Opening the overlay always reloads real history from the agent (it has its
 * own server-side memory now, not just a local mock) and gates the composer
 * until that finishes loading.
 */
export function MYourWidget() {
  const { persona } = usePersona();
  const cif = persona.cif;

  const [open, setOpen] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locked, setLocked] = useState(false);
  const idRef = useRef(0);
  const titleId = useId();
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHistory = useCallback(() => {
    setHistoryStatus("loading");
    getChatHistory(cif)
      .then((res) => {
        setMessages(fromHistory(res.messages));
        setHistoryStatus("ready");
      })
      .catch(() => setHistoryStatus("error"));
  }, [cif]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const composerDisabled = historyStatus !== "ready" || sending || deleting || locked;

  async function send() {
    const text = input.trim();
    if (!text || composerDisabled) return;
    const userId = `m${++idRef.current}`;
    const replyId = `m${++idRef.current}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const res = await sendChatMessage(text, cif);
      setMessages((prev) => [...prev, { id: replyId, role: "agent", text: res.answer, ui: res.ui }]);
    } catch {
      setMessages((prev) => [...prev, { id: replyId, role: "agent", text: SEND_ERROR, error: true }]);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (deleting || locked) return;
    setDeleting(true);
    try {
      await deleteChatHistory(cif);
      setMessages([]);
      setLocked(true);
      lockTimerRef.current = setTimeout(() => setLocked(false), DELETE_LOCK_MS);
    } catch {
      // Nothing was actually deleted server-side — leave the transcript as is.
    } finally {
      setDeleting(false);
    }
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
          {/* width/height reserve the box before CSS loads — avoids a flash at
              the source image's native 1254×1254 size on a cold page load. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon_agent.png" alt="" width={68} height={68} className="h-full w-full object-cover" />
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
              <img src="/icon_agent.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted">Trợ lý Tài chính của bạn</p>
              <h2 id={titleId} className="text-base font-bold tracking-tight text-text">
                M-Your
              </h2>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || locked}
                aria-label="Xóa hội thoại"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40"
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
            {historyStatus === "loading" && <Loading label="Đang tải hội thoại…" />}

            {historyStatus === "error" && (
              <ErrorState
                description="Không tải được hội thoại với M-Your. Vui lòng thử lại."
                action={
                  <button
                    type="button"
                    onClick={loadHistory}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
                  >
                    Thử lại
                  </button>
                }
              />
            )}

            {historyStatus === "ready" && (
              <div className="flex flex-col gap-3">
                {messages.length === 0 && (
                  <div className="shadow-card max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-muted px-3.5 py-2.5 text-sm text-text">
                    {GREETING}
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                        m.role === "user"
                          ? "brand-gradient rounded-br-sm text-white"
                          : m.error
                            ? "shadow-card rounded-bl-sm bg-negative-soft text-negative"
                            : "shadow-card rounded-bl-sm bg-surface-muted text-text",
                      )}
                    >
                      {m.role === "agent" ? <AgentMarkdown text={m.text} /> : m.text}
                    </div>
                    {m.role === "agent" && isChartUi(m.ui) && <AgentChartCard chart={m.ui} />}
                    {m.role === "agent" && isTransferFormUi(m.ui) && <AgentTransferFormCard form={m.ui} />}
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="shadow-card rounded-2xl rounded-bl-sm bg-surface-muted px-3.5 py-2.5 text-sm text-muted">
                      Đang trả lời…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shadow-nav shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+var(--safe-area-bottom))]">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                disabled={composerDisabled}
                placeholder="Nhắn tin cho M-Your…"
                className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus:bg-surface disabled:opacity-60"
              />
              <button
                type="button"
                onClick={send}
                disabled={composerDisabled || !input.trim()}
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
