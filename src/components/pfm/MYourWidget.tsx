"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, Square, Send, Trash2, X } from "lucide-react";
import { useStreamingSpeech } from "@/lib/use-streaming-speech";
import { cn } from "@/lib/cn";
import { Loading } from "@/components/states";
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
const VOICE_WORD_REVEAL_MS = 70;

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

function sharedWordPrefix(left: string[], right: string[]) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

/**
 * Floating "M-Your" chat button + full-screen overlay for `/pfm/*`, mounted via
 * the `PhoneShell` `fab` slot so it stays visible above the bottom nav on every
 * PFM tab without overlapping the center mic FAB (`VoiceFab`, in the bottom
 * nav — a different `PhoneShell` slot, not in this component's own tree).
 * `VoiceFab` opens this overlay via `?assistant=1` (both a plain tap and a
 * press-and-hold do — same idiom as `HuCategoryTab`'s `?hu=`). Wired to the
 * real agent (`src/lib/agent-api.ts`, proxied through `src/app/api/agent/chat`
 * so the client never sees `AGENT_API_KEY`) — `cif` is the active persona's
 * CIF. Opening the overlay always reloads real history from the agent (it has
 * its own server-side memory now, not just a local mock) and gates the
 * composer until that finishes loading.
 */
export function MYourWidget() {
  const { persona } = usePersona();
  const cif = persona.cif;
  const router = useRouter();
  const params = useSearchParams();
  const assistantParam = params?.get("assistant") === "1";

  const [open, setOpen] = useState(false);
  const isOpen = open || assistantParam;
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready">("loading");
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locked, setLocked] = useState(false);
  const idRef = useRef(0);
  const titleId = useId();
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voicePrefix = useRef("");
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealedTranscriptRef = useRef("");

  const clearVoiceReveal = useCallback(() => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
  }, []);

  const revealVoiceTranscript = useCallback((text: string, final: boolean) => {
    clearVoiceReveal();
    const target = text.trim();
    if (final) {
      revealedTranscriptRef.current = target;
      setInput(composeVoiceDraft(voicePrefix.current, target));
      return;
    }

    const visibleWords = revealedTranscriptRef.current.match(/\S+/g) ?? [];
    const targetWords = target.match(/\S+/g) ?? [];
    let position = sharedWordPrefix(visibleWords, targetWords);

    // A revised hypothesis can change earlier words. Keep only its stable prefix
    // before revealing the newer words, so the composer never appends stale text.
    revealedTranscriptRef.current = targetWords.slice(0, position).join(" ");
    setInput(composeVoiceDraft(voicePrefix.current, revealedTranscriptRef.current));

    const revealNext = () => {
      if (position >= targetWords.length) return;
      position += 1;
      revealedTranscriptRef.current = targetWords.slice(0, position).join(" ");
      setInput(composeVoiceDraft(voicePrefix.current, revealedTranscriptRef.current));
      if (position < targetWords.length) revealTimerRef.current = setTimeout(revealNext, VOICE_WORD_REVEAL_MS);
    };
    revealNext();
  }, [clearVoiceReveal]);

  const voice = useStreamingSpeech(revealVoiceTranscript);
  const voiceBusy = voice.state !== "idle";
  const cancelVoice = useCallback(() => {
    clearVoiceReveal();
    voice.cancel();
  }, [clearVoiceReveal, voice.cancel]);

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

  function close() {
    cancelVoice();
    setOpen(false);
    if (assistantParam) {
      const next = new URLSearchParams(params?.toString());
      next.delete("assistant");
      router.replace(`/pfm?${next.toString()}`, { scroll: false });
    }
  }

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      clearVoiceReveal();
    };
  }, [clearVoiceReveal]);

  const composerDisabled = historyStatus !== "ready" || sending || deleting || locked;

  async function send() {
    const text = input.trim();
    if (!text || composerDisabled || voiceBusy) return;
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
                disabled={composerDisabled || voiceBusy}
                placeholder="Nhắn tin cho M-Your…"
                className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-muted focus:border-primary focus:bg-surface disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => {
                  if (voiceBusy) voice.stop();
                  else {
                    clearVoiceReveal();
                    voicePrefix.current = input.trim();
                    revealedTranscriptRef.current = "";
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
            {(voiceBusy || voice.error) && (
              <p role={voice.error ? "alert" : "status"} className={cn("mt-2 text-xs", voice.error ? "text-negative" : "text-muted")}>
                {voice.error || (voice.state === "connecting" ? "Đang mở micro…" : voice.state === "recording" ? "Đang nghe… Ngừng nói để hoàn tất, hoặc bấm dừng." : "Đang hoàn tất bản chép lời…")}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
