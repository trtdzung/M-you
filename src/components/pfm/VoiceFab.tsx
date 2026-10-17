"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, MessageCircle, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePersona } from "@/providers/context";
import { sendChatMessage, isChartUi, isTransferFormUi, type UiPayload } from "@/lib/agent-api";
import { useStreamingSpeech } from "@/lib/use-streaming-speech";
import { useCategories } from "@/state/categories";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentChartCard } from "./AgentChartCard";
import { AgentTransferFormCard } from "./AgentTransferFormCard";

/** Tallest the plain-text answer may grow in the voice section before it is cut off. */
const ANSWER_MAX_HEIGHT_PX = 144;

/**
 * The agent's plain-text answer, height-limited. When it overflows the limit it
 * fades out and an arrow opens the full chat, where the whole answer (and the
 * rest of the conversation) can be read.
 */
function VoiceAnswer({ text, onOpenChat }: { text: string; onOpenChat: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    setOverflowing(Boolean(el) && el!.scrollHeight > el!.clientHeight + 1);
  }, [text]);

  return (
    <div className="flex w-full flex-col gap-1.5 text-sm text-text">
      <div className="relative">
        <div ref={ref} className="overflow-hidden" style={{ maxHeight: ANSWER_MAX_HEIGHT_PX }}>
          <AgentMarkdown text={text} />
        </div>
        {overflowing && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-tint to-transparent" />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={onOpenChat}
          aria-label="Xem đầy đủ trong Chat"
          className="inline-flex items-center gap-1 self-end text-[11px] font-semibold text-primary hover:underline"
        >
          Xem đầy đủ
          <ArrowRight size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

/**
 * M-Your agent icon (Feature 5), rendered in TWO places: the center slot of the
 * `/pfm/*` bottom nav (default), and a floating icon on the main (festive) screens
 * — Home, accounts, … — mounted in that layout's `PhoneShell` `fab` slot
 * (`floating`). Both open the same voice section; each instance keeps its own
 * state. "Chuyển qua Chat" always lands on `/pfm?assistant=1`, since the chat
 * overlay (`MYourWidget`) only exists in the `/pfm` layout.
 *
 * - A press (tap OR hold) opens a "voice section" flush against the bottom of
 *   the device canvas. Nothing else opens with it: the full chat is a separate
 *   step, reached only through the section's "Chuyển qua Chat" button
 *   (`?assistant=1` — same idiom `HuCategoryTab` uses for `?hu=`, since
 *   `MYourWidget` lives in a different `PhoneShell` slot, not in this
 *   component's own tree). The agent keeps its own server-side history, so the
 *   chat picks up the exchange made here.
 * - While actually HELD, the button pulses ("listening"). Releasing stops that
 *   but does NOT close the section — pressing again resumes it.
 * - The section closes only when the user taps OUTSIDE it (a transparent
 *   backdrop behind it, same pattern as `Sheet.tsx`'s own backdrop).
 * - A plain text field is also available next to the voice capture, and
 *   "Làm mới" clears the field and any reply, ready for another try.
 */
export function VoiceFab({ floating = false }: { floating?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { persona } = usePersona();
  const cif = persona.cif;
  // The whitelist `isTransferFormUi` validates the agent's `category` against.
  // It must be THIS persona's assignable ids: passing nothing falls back to the
  // bundled presets, which would reject every category the user created. The set
  // only ever narrows what renders — it can never widen it (invariant #2).
  const { assignable } = useCategories();
  const expenseIds = useMemo(() => new Set(assignable.map((c) => c.id)), [assignable]);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<{ answer: string; ui: UiPayload } | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const autoSendRef = useRef(false);
  const voice = useStreamingSpeech((text, final) => {
    setTranscript(text);
    if (final && text.trim()) {
      autoSendRef.current = true;
    }
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    if (autoSendRef.current && transcript && !sending) {
      autoSendRef.current = false;
      handleSend();
    }
  }, [transcript, sending]);

  useEffect(() => {
    setContainer(document.getElementById("device-canvas") ?? document.body);
  }, []);

  useEffect(() => {
    if (!listening) {
      voiceRef.current.stop();
      return;
    }
    setTranscript("");
    setReply(null);
    voiceRef.current.start();
    
    function stopListening() {
      setListening(false);
    }
    const releaseEvents = ["pointerup", "pointercancel", "mouseup", "touchend", "touchcancel"] as const;
    for (const type of releaseEvents) window.addEventListener(type, stopListening);
    return () => {
      for (const type of releaseEvents) window.removeEventListener(type, stopListening);
    };
  }, [listening]);

  function onPointerDown() {
    if (!sectionOpen) {
      setSectionOpen(true);
    }
    setListening(true);
  }

  function closeSection() {
    setSectionOpen(false);
    setListening(false);
    voiceRef.current.cancel();
  }

  function switchToChat() {
    setSectionOpen(false);
    setListening(false);
    voiceRef.current.cancel();
    const next = new URLSearchParams(params?.toString());
    next.set("assistant", "1");
    router.replace(`/pfm?${next.toString()}`, { scroll: false });
  }

  function handleRefresh() {
    setTranscript("");
    setReply(null);
    setListening(false);
    voiceRef.current.cancel();
  }

  async function handleSend() {
    const text = transcript.trim();
    if (!text || sending) return;
    setSending(true);
    setReply(null);
    setTranscript("");
    try {
      const res = await sendChatMessage(text, cif);
      setReply({ answer: res.answer, ui: res.ui ?? null });
    } catch {
      setReply({ answer: "Không gửi được, vui lòng thử lại.", ui: null });
    } finally {
      setSending(false);
    }
  }

  const micButton = (
    <button
      type="button"
      onPointerDown={onPointerDown}
      aria-label="Giữ để hỏi M-Your bằng giọng nói"
      aria-pressed={listening}
      className={cn(
        "pointer-events-auto flex h-16 w-16 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface shadow-nav ring-4 transition-transform duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-primary/60 [touch-action:none]",
        listening ? "animate-pulse ring-negative" : "ring-surface/80 hover:scale-105",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon_agent.png" alt="" width={64} height={64} draggable={false} className="h-full w-full object-cover" />
    </button>
  );

  if (!sectionOpen) {
    return floating ? (
      <div className="shell-fab pointer-events-none absolute right-5 z-20 flex justify-end">{micButton}</div>
    ) : (
      micButton
    );
  }
  if (!container) return null;

  return createPortal(
    <div className="absolute inset-0 z-40">
      <button type="button" aria-label="Đóng" className="absolute inset-0 cursor-default" onClick={closeSection} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <div
          className="pointer-events-auto flex w-full flex-col items-center gap-4 rounded-t-card border-t border-border bg-surface px-9 pt-5 pb-[calc(20px+var(--safe-area-bottom))] shadow-nav"
          style={{ minHeight: "48dvh" }}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon_agent.png" alt="" width={32} height={32} className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-text">M-Your</p>
                <p className="truncate text-[11px] leading-tight text-muted">Trợ lý Tài chính của bạn</p>
              </div>
            </div>
            <button
              type="button"
              onClick={switchToChat}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <MessageCircle size={12} strokeWidth={2.2} />
              Chuyển qua Chat
            </button>
          </div>

          <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 overflow-y-auto rounded-2xl border border-dashed border-border bg-surface-tint p-3">
            {sending ? (
              <span className="text-xs text-muted">Đang phân tích…</span>
            ) : reply ? (
              isTransferFormUi(reply.ui, expenseIds) ? (
                <div className="flex w-full flex-col items-start">
                  <AgentTransferFormCard form={reply.ui} fullWidth />
                </div>
              ) : isChartUi(reply.ui) ? (
                <div className="flex w-full flex-col items-start">
                  <AgentChartCard chart={reply.ui} fullWidth />
                </div>
              ) : (
                <VoiceAnswer text={reply.answer} onOpenChat={switchToChat} />
              )
            ) : (
              <span className="text-xs text-muted">M-Your sẵn sàng hỗ trợ bạn</span>
            )}
          </div>

          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={listening ? "Đang nghe… (gõ tạm vì chưa nối giọng nói thật)" : "Nhấn giữ biểu tượng M-Your để nói, hoặc gõ tại đây"}
            className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />

          <div className="flex w-full items-center justify-center gap-6">
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Làm mới, nói lại"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted transition-colors hover:text-text"
            >
              <RotateCcw size={18} />
            </button>

            {micButton}

            <button
              type="button"
              onClick={handleSend}
              disabled={!transcript.trim() || sending}
              aria-label="Gửi"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    container,
  );
}
