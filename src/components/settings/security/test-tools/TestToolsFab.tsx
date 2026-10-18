"use client";

import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { canvasZoom } from "@/lib/motion";
import { useTestToolsFabStore } from "@/state/security/test-tools";
import { QuickActionsSheet } from "./QuickActionsSheet";

const SIZE = 44;
const MARGIN = 8;
// Moves shorter than this count as a tap, not a drag.
const DRAG_PX = 6;
const DEFAULT_POS = { x: 1, y: 0.5 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Floating tester button. Shown only when switched on in Công cụ test. */
export function TestToolsFab() {
  const showFab = useTestToolsFabStore(state => state.showFab);
  // The flag lives in localStorage, so wait for the client to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && showFab ? <DraggableFab /> : null;
}

/** Waits for the phone frame's size, then places the button in it. */
function DraggableFab() {
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);

  // Track the phone frame's size so a saved spot stays inside it after a resize.
  useEffect(() => {
    const canvas = document.getElementById("device-canvas");
    if (!canvas) return;
    const update = () => setFrame({ w: canvas.offsetWidth, h: canvas.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return frame ? <FabButton frame={frame} /> : null;
}

/** Tap opens the quick actions; drag moves it anywhere inside the phone frame (position is saved). */
function FabButton({ frame }: { frame: { w: number; h: number } }) {
  const fabPos = useTestToolsFabStore(state => state.fabPos);
  const setFabPos = useTestToolsFabStore(state => state.setFabPos);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Native listeners: stopping pointerdown at the button keeps AppChrome's
  // edge-swipe-back (a canvas listener) from starting under a drag.
  useEffect(() => {
    const button = buttonRef.current;
    const canvas = document.getElementById("device-canvas");
    if (!button || !canvas) return;
    let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    let suppressClick = false;

    function onDown(event: PointerEvent) {
      if (event.button !== 0) return;
      event.stopPropagation();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: button!.offsetLeft, top: button!.offsetTop, moved: false };
      button!.setPointerCapture(event.pointerId);
    }
    function onMove(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return;
      const zoom = canvasZoom(canvas);
      const dx = (event.clientX - drag.x) / zoom;
      const dy = (event.clientY - drag.y) / zoom;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
      drag.moved = true;
      button!.style.left = `${clamp(drag.left + dx, MARGIN, canvas!.offsetWidth - SIZE - MARGIN)}px`;
      button!.style.top = `${clamp(drag.top + dy, MARGIN, canvas!.offsetHeight - SIZE - MARGIN)}px`;
    }
    function onUp(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      suppressClick = true;
      const freeW = Math.max(1, canvas!.offsetWidth - SIZE - 2 * MARGIN);
      const freeH = Math.max(1, canvas!.offsetHeight - SIZE - 2 * MARGIN);
      setFabPos({ x: clamp((button!.offsetLeft - MARGIN) / freeW, 0, 1), y: clamp((button!.offsetTop - MARGIN) / freeH, 0, 1) });
    }
    // A drag ends with a click; swallow it so dropping the button does not open the sheet.
    function onClick(event: MouseEvent) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    button.addEventListener("pointerdown", onDown);
    button.addEventListener("pointermove", onMove);
    button.addEventListener("pointerup", onUp);
    button.addEventListener("pointercancel", onUp);
    button.addEventListener("click", onClick);
    return () => {
      button.removeEventListener("pointerdown", onDown);
      button.removeEventListener("pointermove", onMove);
      button.removeEventListener("pointerup", onUp);
      button.removeEventListener("pointercancel", onUp);
      button.removeEventListener("click", onClick);
    };
  }, [setFabPos]);

  const pos = fabPos ?? DEFAULT_POS;
  const left = MARGIN + pos.x * Math.max(0, frame.w - SIZE - 2 * MARGIN);
  const top = MARGIN + pos.y * Math.max(0, frame.h - SIZE - 2 * MARGIN);

  return <>
    <button
      ref={buttonRef}
      type="button"
      aria-label="Thao tác nhanh (test)"
      aria-haspopup="dialog"
      title="Thao tác nhanh (test) · kéo để di chuyển"
      onClick={() => setOpen(true)}
      style={{ left, top, width: SIZE, height: SIZE }}
      className="absolute z-30 flex cursor-grab touch-none select-none items-center justify-center rounded-full border border-border bg-surface text-primary opacity-85 shadow-nav hover:opacity-100 active:cursor-grabbing"
    >
      <FlaskConical size={20} aria-hidden />
    </button>
    <QuickActionsSheet open={open} onClose={() => setOpen(false)} />
  </>;
}
