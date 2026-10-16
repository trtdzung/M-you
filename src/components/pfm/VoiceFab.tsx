"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePersona } from "@/providers/context";
import { sendChatMessage, isTransferFormUi, type UiPayload } from "@/lib/agent-api";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentTransferFormCard } from "./AgentTransferFormCard";

/**
 * Center mic FAB of the PFM wallet bottom nav (Feature 5) — replaces the
 * retired ＋ "Thêm giao dịch" FAB.
 *
 * - A press (tap OR hold — both work the same way at press-time) opens the
 *   full M-Your chat screen behind it (`?assistant=1` — same idiom
 *   `HuCategoryTab` uses for `?hu=`, since `MYourWidget` lives in a
 *   different `PhoneShell` slot, not in this component's own tree) and a
 *   "voice section" flush against the bottom of the device canvas (the
 *   chat is always open underneath by the time this shows, so there's no
 *   bottom nav left to clear — the chat's own composer sits below it,
 *   same as any other bottom sheet in this app).
 * - While actually HELD, the mic pulses ("listening" visual). Releasing
 *   stops that but does NOT close the section — pressing again resumes it.
 * - The section closes only when the user taps OUTSIDE it (a transparent
 *   backdrop behind the section, same pattern as `Sheet.tsx`'s own
 *   backdrop, just without the dark tint — the chat behind must stay
 *   clearly visible, not dimmed).
 *
 * `/api/stt/session` returns 503 in this environment (no backend
 * configured), so this doesn't call `useStreamingSpeech`/`StreamingSpeech`
 * at all — holding the mic is a visual-only stand-in for "recording". In
 * its place, a plain text field lets you type what would have been
 * transcribed, so the real "Gửi" round-trip to the agent (same
 * `sendChatMessage` Feature 3 already uses) can still be tested while that
 * backend is unreachable. "Làm mới" clears the field and any reply, ready
 * for another try. The mic already inside `MYourWidget`'s own composer is
 * unaffected either way.
 */
export function VoiceFab() {
  const router = useRouter();
  const params = useSearchParams();
  const { persona } = usePersona();
  const cif = persona.cif;
  const [sectionOpen, setSectionOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<{ answer: string; ui: UiPayload } | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById("device-canvas") ?? document.body);
  }, []);

  // Release detection MUST be window-level, not the button's own `onPointerUp`:
  // once the section opens, this component stops rendering the button inline
  // and instead renders a NEW instance inside the portal (see the
  // `!sectionOpen` branch below) — the original element is gone, so its own
  // pointerup would never fire. Covers every release event type, not just
  // Pointer Events, since some mobile browsers suppress one but not another
  // during a sustained touch-hold.
  useEffect(() => {
    if (!listening) return;
    function stopListening() {
      setListening(false);
    }
    const releaseEvents = ["pointerup", "pointercancel", "mouseup", "touchend", "touchcancel"] as const;
    for (const type of releaseEvents) window.addEventListener(type, stopListening);
    return () => {
      for (const type of releaseEvents) window.removeEventListener(type, stopListening);
    };
  }, [listening]);

  function openChat() {
    const next = new URLSearchParams(params?.toString());
    next.set("assistant", "1");
    router.replace(`/pfm?${next.toString()}`, { scroll: false });
  }

  function onPointerDown() {
    if (!sectionOpen) {
      openChat();
      setSectionOpen(true);
    }
    setListening(true);
  }

  function closeSection() {
    setSectionOpen(false);
    setListening(false);
  }

  function handleRefresh() {
    setTranscript("");
    setReply(null);
    setListening(false);
  }

  async function handleSend() {
    const text = transcript.trim();
    if (!text || sending) return;
    setSending(true);
    setReply(null);
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
        "pointer-events-auto flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full text-primary-fg shadow-nav ring-4 ring-surface/80 transition-transform duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 [touch-action:none]",
        listening ? "animate-pulse bg-negative" : "brand-gradient hover:scale-105",
      )}
    >
      <Mic size={24} strokeWidth={2.4} />
    </button>
  );

  if (!sectionOpen) return micButton;
  if (!container) return null;

  return createPortal(
    <div className="absolute inset-0 z-40">
      <button type="button" aria-label="Đóng" className="absolute inset-0 cursor-default" onClick={closeSection} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4">
        <div
          className="pointer-events-auto flex w-full max-w-device-width flex-col items-center gap-4 rounded-t-card border border-border bg-surface p-5 pb-[calc(20px+var(--safe-area-bottom))] shadow-nav"
          style={{ minHeight: "48dvh" }}
        >
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 overflow-y-auto rounded-2xl border border-dashed border-border bg-surface-tint p-3">
            {sending ? (
              <span className="text-xs text-muted">Đang phân tích…</span>
            ) : reply ? (
              isTransferFormUi(reply.ui) ? (
                <AgentTransferFormCard form={reply.ui} />
              ) : (
                <AgentMarkdown text={reply.answer} />
              )
            ) : (
              <span className="text-xs text-muted">Đang chờ…</span>
            )}
          </div>

          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={listening ? "Đang nghe… (gõ tạm vì chưa nối giọng nói thật)" : "Nhấn giữ mic để nói, hoặc gõ tại đây"}
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
