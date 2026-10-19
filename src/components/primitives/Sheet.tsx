"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { canvasZoom, prefersMotion } from "@/lib/motion";
import { usePanelActive } from "@/components/shell/PanelActive";

const EXIT_FALLBACK_MS = 320;

/** Shared accessible bottom sheet for reports, editors, and confirmations. */
export function Sheet({
  title,
  description,
  open = true,
  onClose,
  children,
  className,
  bodyClassName,
  headerAction,
  closeLabel = "Đóng",
}: {
  title: string;
  description?: string;
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerAction?: ReactNode;
  closeLabel?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const skipExitRef = useRef(false);
  const dragRef = useRef<{ id: number; origin: number; lastY: number; lastT: number } | null>(null);
  const panelActive = usePanelActive();
  const [phase, setPhase] = useState<"open" | "closed" | "exiting">(open ? "open" : "closed");
  const [dragY, setDragY] = useState(0);
  const [dragMode, setDragMode] = useState<"idle" | "drag" | "snap" | "rest">("idle");

  // A hidden PFM tab must not keep a portaled sheet on screen. Exit animation
  // only runs when the caller keeps the sheet mounted and sets `open` to false.
  const live = open && panelActive;
  if (!panelActive && phase !== "closed") {
    setPhase("closed");
  } else if (live && phase !== "open") {
    setPhase("open");
  } else if (!open && phase === "open") {
    const instant = skipExitRef.current || !prefersMotion();
    skipExitRef.current = false;
    setPhase(instant ? "closed" : "exiting");
  }
  if (phase === "closed" && dragMode !== "idle") {
    setDragMode("idle");
    setDragY(0);
  }

  const frameRef = useRef({ title, description, children, className, bodyClassName, headerAction });
  if (live) frameRef.current = { title, description, children, className, bodyClassName, headerAction };
  const frame = live ? { title, description, children, className, bodyClassName, headerAction } : frameRef.current;

  // Anchor the sheet inside the device frame, not the browser viewport. The
  // desktop preview applies `zoom` to `.device-canvas`, which breaks
  // `position: fixed` (it would sink below the phone frame). Portalling into the
  // canvas and positioning `absolute` keeps the sheet clipped to the frame on
  // both desktop and mobile. Resolved after mount so SSR stays inert.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.getElementById("device-canvas") ?? document.body);
  }, []);

  useEffect(() => {
    if (!live) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]):not([data-sheet-backdrop]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const previous = restoreFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose, live]);

  useEffect(() => {
    if (phase !== "exiting") return;
    const timeout = window.setTimeout(() => setPhase("closed"), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  if (phase === "closed" || !container) return null;

  const exiting = phase === "exiting";

  function pointY(clientY: number) {
    return clientY / canvasZoom();
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!prefersMotion() || exiting || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;
    dragRef.current = { id: event.pointerId, origin: pointY(event.clientY), lastY: pointY(event.clientY), lastT: event.timeStamp };
    setDragMode("drag");
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is unavailable for this pointer. Move and up still arrive on the handle.
    }
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const y = pointY(event.clientY);
    drag.lastY = y;
    drag.lastT = event.timeStamp;
    setDragY(Math.max(0, y - drag.origin));
  }

  function onHandlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    const y = pointY(event.clientY);
    const dy = Math.max(0, y - drag.origin);
    const velocity = (y - drag.lastY) / Math.max(16, event.timeStamp - drag.lastT);
    if (dy > 96 || (dy > 48 && velocity > 0.65)) {
      skipExitRef.current = true;
      setDragMode("idle");
      onClose();
      return;
    }
    if (dy === 0) {
      setDragMode("rest");
      return;
    }
    setDragY(0);
    setDragMode("snap");
  }

  return createPortal(
    <div
      className={cn("absolute inset-0 z-40 flex items-end justify-center", exiting && "pointer-events-none")}
      data-testid="sheet-root"
      inert={exiting}
    >
      <button
        type="button"
        aria-label={closeLabel}
        data-sheet-backdrop="true"
        tabIndex={-1}
        className={cn("absolute inset-0 cursor-pointer bg-black/40", exiting ? "sheet-backdrop-out" : "sheet-backdrop-in")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role={exiting ? undefined : "dialog"}
        aria-modal={exiting ? undefined : true}
        aria-hidden={exiting || undefined}
        aria-labelledby={exiting ? undefined : titleId}
        aria-describedby={!exiting && description ? descriptionId : undefined}
        onAnimationEnd={(event) => {
          if (event.target !== panelRef.current) return;
          if (!event.animationName.includes("sheet-panel-out")) return;
          setPhase("closed");
        }}
        onTransitionEnd={(event) => {
          if (event.target !== panelRef.current || event.propertyName !== "transform") return;
          if (dragMode === "snap") setDragMode("rest");
        }}
        style={dragMode === "drag" || dragMode === "snap" ? { transform: `translateY(${dragY}px)` } : undefined}
        className={cn(
          "relative flex max-h-[88dvh] w-full max-w-device-width flex-col overflow-hidden rounded-t-card bg-surface shadow-nav",
          exiting
            ? "sheet-panel-out"
            : dragMode === "drag"
              ? "sheet-dragging"
              : dragMode === "snap"
                ? "sheet-snap"
                : dragMode === "rest"
                  ? "sheet-rest"
                  : "sheet-panel-in",
          frame.className,
        )}
      >
        <div
          data-sheet-handle
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          className="flex shrink-0 cursor-grab touch-none items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-4"
        >
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-text">
              {frame.title}
            </h2>
            {frame.description && (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {frame.description}
              </p>
            )}
          </div>
          {frame.headerAction}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className={cn("no-scrollbar min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(24px+var(--safe-area-bottom))]", frame.bodyClassName)}>{frame.children}</div>
      </div>
    </div>,
    container,
  );
}
