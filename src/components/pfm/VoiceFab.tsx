"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { useBatchSpeech } from "@/lib/use-batch-speech";
import { putVoiceAssistantDraft } from "@/lib/voice-assistant-handoff";

const HOLD_DELAY_MS = 220;

/**
 * Center voice entry point. A tap opens only the compact panel. Holding the
 * same press starts batch capture; releasing submits the complete recording.
 * A transcript becomes an editable M-Your draft and is never sent implicitly.
 */
export function VoiceFab() {
  const router = useRouter();
  const params = useSearchParams();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressActive = useRef(false);
  const holdStarted = useRef(false);

  const openChatWithDraft = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    putVoiceAssistantDraft(clean);
    setSectionOpen(false);
    const next = new URLSearchParams(params?.toString());
    next.set("assistant", "1");
    router.replace(`/pfm?${next.toString()}`, { scroll: false });
  }, [params, router]);

  const acceptVoiceTranscript = useCallback((text: string) => {
    const clean = text.trim();
    setTranscript(clean);
    if (clean) openChatWithDraft(clean);
  }, [openChatWithDraft]);

  const voice = useBatchSpeech(acceptVoiceTranscript);
  const { state: voiceState, error: voiceError, levels, start: startVoice, stop: stopVoice, cancel: cancelVoice } = voice;
  const voiceBusy = voiceState !== "idle";

  useEffect(() => {
    setContainer(document.getElementById("device-canvas") ?? document.body);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const finishPress = useCallback((cancel = false) => {
    if (!pressActive.current) return;
    pressActive.current = false;
    clearHoldTimer();
    if (!holdStarted.current) return;
    holdStarted.current = false;
    if (cancel) cancelVoice();
    else stopVoice();
  }, [cancelVoice, clearHoldTimer, stopVoice]);

  useEffect(() => {
    const release = () => finishPress(false);
    const cancel = () => finishPress(true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
      clearHoldTimer();
    };
  }, [clearHoldTimer, finishPress]);

  function beginPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button > 0 || pressActive.current || voiceBusy) return;
    event.preventDefault();
    setSectionOpen(true);
    pressActive.current = true;
    holdStarted.current = false;
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      if (!pressActive.current) return;
      holdStarted.current = true;
      startVoice();
    }, HOLD_DELAY_MS);
  }

  function closeSection() {
    pressActive.current = false;
    holdStarted.current = false;
    clearHoldTimer();
    cancelVoice();
    setSectionOpen(false);
  }

  function handleRefresh() {
    cancelVoice();
    setTranscript("");
  }

  const micButton = (
    <button
      type="button"
      onPointerDown={beginPress}
      onContextMenu={(event) => event.preventDefault()}
      disabled={voiceState === "processing"}
      aria-label="Nhấn để mở, giữ để nói với M-Your"
      aria-pressed={voiceState === "recording"}
      className={cn(
        "pointer-events-auto flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full text-primary-fg shadow-nav ring-4 ring-surface/80 transition-transform duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 [touch-action:none] disabled:opacity-60",
        voiceState === "recording" ? "animate-pulse bg-negative" : "brand-gradient hover:scale-105",
      )}
    >
      <Mic size={24} strokeWidth={2.4} />
    </button>
  );

  if (!sectionOpen) return micButton;
  if (!container) return null;

  return createPortal(
    <div className="absolute inset-0 z-40">
      <button type="button" aria-label="Đóng cửa sổ giọng nói" className="absolute inset-0 cursor-default" onClick={closeSection} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4">
        <div
          className="pointer-events-auto flex w-full max-w-device-width flex-col items-center gap-4 rounded-t-card border border-border bg-surface p-5 pb-[calc(20px+var(--safe-area-bottom))] shadow-nav"
          style={{ minHeight: "48dvh" }}
        >
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-dashed border-border bg-surface-tint p-3">
            {voiceState === "recording" ? (
              <>
                <span className="text-sm text-muted">Đang nghe…</span>
                <div role="img" aria-label="Dạng sóng âm thanh đang thu" className="flex h-10 items-center justify-center gap-1">
                  {levels.map((level, index) => (
                    <span key={index} aria-hidden="true" className="w-1 rounded-full bg-primary transition-[height] duration-100" style={{ height: `${Math.max(4, Math.round(level * 32))}px` }} />
                  ))}
                </div>
              </>
            ) : voiceState === "connecting" ? (
              <span className="text-sm text-muted">Đang mở micro…</span>
            ) : voiceState === "processing" ? (
              <span className="text-sm text-muted">Đang nhận dạng bản ghi âm…</span>
            ) : (
              <span className="text-sm text-muted">Đang chờ…</span>
            )}
          </div>

          <input
            type="text"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            disabled={voiceBusy}
            placeholder={voiceState === "recording" ? "Đang nghe…" : "Nhấn giữ mic để nói, hoặc gõ tại đây"}
            className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
          />

          <div className="flex w-full items-center justify-center gap-6">
            <button type="button" onClick={handleRefresh} disabled={voiceState === "processing"} aria-label="Làm mới, nói lại" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted transition-colors hover:text-text disabled:opacity-40">
              <RotateCcw size={18} />
            </button>

            {micButton}

            <button type="button" onClick={() => openChatWithDraft(transcript)} disabled={!transcript.trim() || voiceBusy} aria-label="Mở M-Your với nội dung này" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity disabled:opacity-40">
              <Send size={18} />
            </button>
          </div>

          {voiceError && <p role="alert" className="w-full text-xs text-negative">{voiceError}</p>}
        </div>
      </div>
    </div>,
    container,
  );
}
