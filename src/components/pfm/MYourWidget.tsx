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
import { useCategories } from "@/state/categories";
import {
  getChatHistory,
  sendChatMessage,
  deleteChatHistory,
  isChartUi,
  isClarifyOptionsUi,
  isJarUi,
  isTransferFormUi,
  type HistoryMessage,
  type UiPayload,
} from "@/lib/agent-api";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentChartCard } from "./AgentChartCard";
import { AgentClarifyOptionsCard } from "./AgentClarifyOptionsCard";
import { AgentTransferFormCard } from "./AgentTransferFormCard";
import { AgentJarUiCard } from "./AgentJarUiCard";
import { ClarifyAnswerBubble } from "./ClarifyAnswerBubble";
import { takeInsightDraft } from "@/insights/proactive/chat-handoff";

interface ChatBubble {
  id: string;
  role: "user" | "agent";
  text: string; // visible display text
  sendText?: string; // full text sent to agent (may include hidden context)
  ui?: UiPayload;
  error?: boolean;
}

const GREETING = "Xin chào 👋 Mình là M-You. Bạn cần hỏi gì về tài chính của mình?";
const SEND_ERROR = "Không gửi được tin nhắn, vui lòng thử lại.";
const DELETE_LOCK_MS = 30_000;

/**
 * The `clarify_options` bubble right before `idx` that this one is chained to
 * (its own PRECEDING bubble in the same unbroken clarify→answer→clarify run) —
 * `null` when `idx` is the first question of its chain. Lets "← Câu trước" walk
 * back through however many clarify questions the agent asked in a row.
 */
function previousClarifyIndex(messages: ChatBubble[], idx: number): number | null {
  const prev = idx - 2;
  if (prev < 0) return null;
  if (messages[idx - 1]?.role !== "user") return null;
  if (messages[prev].role !== "agent" || !isClarifyOptionsUi(messages[prev].ui)) return null;
  return prev;
}

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
 * Full-screen "M-You" chat overlay for `/pfm/*`, mounted via the `PhoneShell`
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
  const [inputVisible, setInputVisible] = useState(""); // text shown in textarea/bubble
  const draftPersona = useRef(cif);
  const insightParam = params?.get("insight") === "1";
  useEffect(() => {
    if (draftPersona.current !== cif) {
      setInput("");
      setInputVisible("");
      draftPersona.current = cif;
    }
    if (!isOpen || !insightParam) return;
    const payload = takeInsightDraft(cif);
    if (payload) {
      setInput(payload.draft);          // full draft (with hidden seed) → sent to agent
      setInputVisible(payload.visibleText); // only the question → shown in UI
    }
  }, [isOpen, insightParam, cif]);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locked, setLocked] = useState(false);
  const idRef = useRef(0);
  const titleId = useId();
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const voicePrefix = useRef("");

  // The STT service's own `transfer_between_jars` interpretation used to gate a local
  // "cần thêm hũ nguồn/đích" hint here — dropped: it false-positives on ordinary
  // utterances that merely mention a jar's name (e.g. a person transfer noted "tiền
  // ăn uống"), and this screen never auto-sends on voice anyway (the customer always
  // presses Gửi themselves) — the real agent already asks for what it actually needs.
  const acceptFinalVoiceTranscript = useCallback((text: string, final: boolean) => {
    // Partial captions stay separate from the draft. Only the server's final
    // after refinement/fallback may update the composer.
    if (!final) return;
    const nextText = composeVoiceDraft(voicePrefix.current, text.trim());
    setInput(nextText);
    setInputVisible(nextText);
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
  const [expandedClarify, setExpandedClarify] = useState<Set<string>>(new Set());
  const [reopenedIndex, setReopenedIndex] = useState<number | null>(null);

  /**
   * Posts `text` as one customer turn — the composer's own send, and a
   * `clarify_options` answer (button pick or its "Khác" custom text) alike.
   * The latter is NOT a different mechanism: the contract is explicit that
   * picking an option sends its exact `label` through this same `/chat` call
   * (`agent_backend_docs/clarify-options.md`).
   */
  async function postMessage(text: string) {
    if (!text || composerDisabled || voiceBusy) return;
    const userId = `m${++idRef.current}`;
    const replyId = `m${++idRef.current}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", text }]);
    setReopenedIndex(null); // answering (even a reopened past question) always resumes at the live latest turn
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

  async function send() {
    const text = input.trim();
    if (!text) return;
    // Show only the visible question in the bubble; send full text (with hidden context) to agent
    const visibleForBubble = inputVisible.trim() || text;
    setInput("");
    setInputVisible("");
    // Temporarily patch postMessage to use visibleForBubble for the bubble
    if (!composerDisabled && !voiceBusy) {
      const userId = `m${++idRef.current}`;
      const replyId = `m${++idRef.current}`;
      setMessages((prev) => [...prev, { id: userId, role: "user", text: visibleForBubble, sendText: text }]);
      setReopenedIndex(null);
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
              <img
                src="/icon_agent.png"
                alt=""
                width={36}
                height={36}
                draggable={false}
                className="pointer-events-none h-full w-full select-none object-cover [-webkit-touch-callout:none]"
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted">Trợ lý Tài chính của bạn</p>
              <h2 id={titleId} className="text-base font-bold tracking-tight text-text">
                M-You
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
                <p>Không tải được lịch sử M-You. Bạn vẫn có thể thử nhập bằng giọng nói.</p>
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
                {messages.map((m, idx) => {
                  // A user bubble right after a `clarify_options` question is the answer to
                  // it — collapse it, whether it just got sent or came back from history.
                  const isClarifyAnswer = m.role === "user" && isClarifyOptionsUi(messages[idx - 1]?.ui);
                  if (isClarifyAnswer) {
                    return (
                      <div key={m.id} className="flex flex-col items-end">
                        <ClarifyAnswerBubble
                          text={m.text}
                          expanded={expandedClarify.has(m.id)}
                          onToggle={() =>
                            setExpandedClarify((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            })
                          }
                        />
                      </div>
                    );
                  }
                  const clarify = m.role === "agent" && isClarifyOptionsUi(m.ui) ? m.ui : null;
                  const isLatestUnanswered = clarify !== null && idx === messages.length - 1;
                  const isReopened = clarify !== null && reopenedIndex === idx;
                  return (
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
                      {clarify && (isLatestUnanswered || isReopened) && (
                        <AgentClarifyOptionsCard
                          ui={clarify}
                          disabled={sending}
                          reopened={isReopened}
                          hasPrevious={previousClarifyIndex(messages, idx) !== null}
                          onAnswer={(text) => void postMessage(text)}
                          onBack={() => {
                            const prev = previousClarifyIndex(messages, idx);
                            if (prev !== null) setReopenedIndex(prev);
                          }}
                          onCancelEdit={() => setReopenedIndex(null)}
                        />
                      )}
                    </div>
                  );
                })}
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
                value={inputVisible}
                onChange={(e) => {
                  setInput(e.target.value);
                  setInputVisible(e.target.value);
                }}
                onKeyDown={handleKey}
                rows={1}
                disabled={composerDisabled || voiceBusy}
                placeholder="Nhắn tin cho M-You…"
                className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus:bg-surface disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => {
                  if (voiceBusy) voice.stop();
                  else {
                    voicePrefix.current = input.trim();
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
                disabled={composerDisabled || voiceBusy || !inputVisible.trim()}
                aria-label="Gửi"
                className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
            {(voiceBusy || voice.error) && (
              <div
                role={voice.error ? "alert" : "status"}
                aria-live="polite"
                className={cn("mt-2 flex items-center gap-2 text-xs", voice.error ? "text-negative" : "text-muted")}
              >
                {!voice.error && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
                <span>
                  {voice.error || (voice.state === "connecting"
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
