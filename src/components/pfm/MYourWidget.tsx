"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, Square, Send, Trash2, X } from "lucide-react";
import { useStreamingSpeech } from "@/lib/use-streaming-speech";
import { cn } from "@/lib/cn";
import { Loading } from "@/components/states";
import { usePersona } from "@/providers/context";
import { useJarConfig } from "@/state/jars";
import { jarSpeechContext } from "@/lib/speech-context";
import type { SpeechFinalMetadata } from "@/lib/speech-types";
import { useCategories } from "@/state/categories";
import {
  getChatHistory,
  sendChatMessage,
  deleteChatHistory,
  isChartUi,
  isJarUi,
  isTransferFormUi,
  type HistoryMessage,
  type UiPayload,
} from "@/lib/agent-api";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentChartCard } from "./AgentChartCard";
import { AgentTransferFormCard } from "./AgentTransferFormCard";
import { AgentJarUiCard } from "./AgentJarUiCard";

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

function composeVoiceDraft(prefix: string, transcript: string) {
  return [prefix, transcript].filter(Boolean).join(" ");
}

/**
 * Full-screen "M-Your" chat overlay for `/pfm/*`, mounted via the `PhoneShell`
 * `fab` slot. It has no entry button of its own any more: `VoiceFab` (the center
 * agent tab of the bottom nav) opens its voice section first, and that section's
 * "Chuyển qua Chat" button opens this overlay via `?assistant=1` (same idiom as
 * `HuCategoryTab`'s `?hu=`). Wired to the
 * real agent (`src/lib/agent-api.ts`, proxied through `src/app/api/agent/chat`
 * so the client never sees `AGENT_API_KEY`) — `cif` is the active persona's
 * CIF. Opening the overlay always reloads real history from the agent (it has
 * its own server-side memory now, not just a local mock) and gates the
 * composer until that finishes loading.
 */
export function MYourWidget() {
  const { persona } = usePersona();
  const { config: jarConfig } = useJarConfig();
  // Whitelist for `isTransferFormUi` — THIS persona's assignable ids, never the
  // bundled presets (which would drop every category the user created). Narrows
  // only; an id outside it simply does not render a card (invariant #2).
  const { assignable } = useCategories();
  const expenseIds = useMemo(() => new Set(assignable.map((c) => c.id)), [assignable]);
  const cif = persona.cif;
  const speechContext = useMemo(
    () => jarSpeechContext(jarConfig.jars.map((jar) => ({ id: jar.id, label: jar.label }))),
    [jarConfig.jars],
  );
  const router = useRouter();
  const params = useSearchParams();
  const assistantParam = params?.get("assistant") === "1";

  const isOpen = assistantParam;
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready">("loading");
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [voiceGuidance, setVoiceGuidance] = useState("");
  const idRef = useRef(0);
  const titleId = useId();
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const voicePrefix = useRef("");

  const acceptFinalVoiceTranscript = useCallback((text: string, final: boolean, metadata?: SpeechFinalMetadata) => {
    // Partial captions stay separate from the draft. Only the server's final
    // after refinement/fallback may update the composer.
    if (!final) return;
    setInput(composeVoiceDraft(voicePrefix.current, text.trim()));
    const interpretation = metadata?.interpretation;
    setVoiceGuidance(
      interpretation?.intent === "transfer_between_jars" && !interpretation.actionable
        ? interpretation.clarification || "Mình chưa nghe đủ thông tin chuyển tiền. Bạn có thể bổ sung trước khi gửi."
        : "",
    );
  }, []);

  const voice = useStreamingSpeech(acceptFinalVoiceTranscript, { ...speechContext, endpointing: "silence" });
  const voiceBusy = voice.state !== "idle";
  const cancelVoice = voice.cancel;

  useEffect(() => {
    cancelVoice();
  }, [isOpen, cif, cancelVoice]);

  const loadHistory = useCallback(() => {
    setHistoryStatus("loading");
    setHistoryUnavailable(false);
    getChatHistory(cif)
      .then((res) => {
        setMessages(fromHistory(res.messages));
        setHistoryStatus("ready");
      })
      .catch(() => {
        // History belongs to the Agent Backend, while speech capture talks to
        // the STT service independently. Keep the composer available so a
        // temporary agent outage does not prevent local STT verification.
        setMessages([]);
        setHistoryUnavailable(true);
        setHistoryStatus("ready");
      });
  }, [cif]);

  useEffect(() => {
    if (isOpen) loadHistory();
  }, [isOpen, loadHistory]);

  // Jump to the newest message whenever the overlay opens, its history finishes
  // loading, or the thread grows — and keep following the bottom as the
  // message list's actual height changes afterward (a card like
  // `AgentTransferFormCard` resolves its beneficiary lookup, or a bank logo
  // image loads, AFTER the message is added, growing the list past where a
  // one-shot scroll already landed). A `ResizeObserver` on the scroll
  // container catches every one of those instead of only the react-state
  // change that added the message.
  useEffect(() => {
    if (!isOpen) return;
    const scrollToBottom = () => {
      // jsdom (unit tests) has no scrollIntoView implementation — guard it out
      // rather than skip the effect, so the scroll-on-new-message behavior is
      // still exercised by anything that does mock it.
      messagesEndRef.current?.scrollIntoView?.({ block: "end" });
    };
    scrollToBottom();
    // Observe the intrinsic-height message LIST, not the fixed-size scroll
    // viewport around it (that one never resizes — the whole point of
    // `overflow-y-auto` — so it would never fire here).
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isOpen, historyStatus]);

  function close() {
    cancelVoice();
    const next = new URLSearchParams(params?.toString());
    next.delete("assistant");
    router.replace(`/pfm?${next.toString()}`, { scroll: false });
  }

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const composerDisabled = historyStatus !== "ready" || sending || deleting || locked;

  async function send() {
    const text = input.trim();
    if (!text || composerDisabled || voiceBusy) return;
    const userId = `m${++idRef.current}`;
    const replyId = `m${++idRef.current}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", text }]);
    setInput("");
    setVoiceGuidance("");
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
    if (deleting || locked || voiceBusy) return;
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
      {isOpen && (
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
                disabled={deleting || locked || voiceBusy}
                aria-label="Xóa hội thoại"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40"
              >
                <Trash2 size={19} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Đóng"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {historyStatus === "loading" && <Loading label="Đang tải hội thoại…" />}

            {historyUnavailable && (
              <div role="alert" className="mb-3 rounded-2xl bg-warning-soft px-3.5 py-3 text-sm text-text">
                <p>Không tải được lịch sử M-Your. Bạn vẫn có thể thử nhập bằng giọng nói.</p>
                <button
                  type="button"
                  onClick={loadHistory}
                  className="mt-2 font-semibold text-primary"
                >
                  Thử tải lại lịch sử
                </button>
              </div>
            )}

            {historyStatus === "ready" && (
              <div ref={messagesContainerRef} className="flex flex-col gap-3">
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
                    {m.role === "agent" && isTransferFormUi(m.ui, expenseIds) && <AgentTransferFormCard form={m.ui} />}
                    {m.role === "agent" && isJarUi(m.ui, expenseIds) && <AgentJarUiCard ui={m.ui} />}
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="shadow-card rounded-2xl rounded-bl-sm bg-surface-muted px-3.5 py-2.5 text-sm text-muted">
                      Đang trả lời…
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="shadow-nav shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+var(--safe-area-bottom))]">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setVoiceGuidance("");
                }}
                onKeyDown={handleKey}
                rows={1}
                disabled={composerDisabled || voiceBusy}
                placeholder="Nhắn tin cho M-Your…"
                className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus:bg-surface disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => {
                  if (voiceBusy) voice.stop();
                  else {
                    voicePrefix.current = input.trim();
                    setVoiceGuidance("");
                    voice.start();
                  }
                }}
                disabled={composerDisabled || voice.state === "finishing"}
                aria-label={voice.state === "connecting" ? "Hủy kết nối micro" : voiceBusy ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
                aria-pressed={voiceBusy}
                className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40", voiceBusy ? "bg-negative-soft text-negative" : "bg-surface-muted text-primary")}
              >
                {voiceBusy ? <Square size={16} /> : <Mic size={18} />}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={composerDisabled || voiceBusy || !input.trim()}
                aria-label="Gửi"
                className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
            {(voiceBusy || voice.error || voiceGuidance) && (
              <div
                role={voice.error ? "alert" : "status"}
                aria-live="polite"
                className={cn("mt-2 flex items-center gap-2 text-xs", voice.error ? "text-negative" : "text-muted")}
              >
                {!voice.error && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
                <span>
                  {voice.error || voiceGuidance || (voice.state === "connecting"
                    ? "Đang mở micro… Hãy cho phép micro nếu được hỏi."
                    : voice.state === "recording"
                      ? "Mình đang nghe… Bấm dừng khi bạn nói xong."
                      : "Đã ghi âm. Đang nhận dạng và hoàn thiện câu chữ…")}
                </span>
              </div>
            )}
            {voice.partial && voiceBusy && (
              <p className="mt-2 max-h-24 overflow-y-auto break-words text-sm text-text" aria-label="Nội dung nghe được tạm thời">
                Mình nghe được: {voice.partial}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
