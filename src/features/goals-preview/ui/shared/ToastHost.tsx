"use client";

import { useCallback, useEffect } from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Toast, ToastTone } from "../../model/types";
import { usePreview } from "../../store/PreviewStore";
import { DeviceOverlay } from "./DeviceOverlay";
import { ring } from "./styles";

const AUTO_DISMISS_MS = 4200;

const TONE: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-source-msb" },
  success: { icon: CheckCircle2, className: "text-positive" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  error: { icon: XCircle, className: "text-negative" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS + Math.min(4000, toast.message.length * 25));
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.message.length, onDismiss]);
  const { icon: Icon, className } = TONE[toast.tone];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto flex items-start gap-2.5 rounded-2xl bg-ink-soft px-3.5 py-3 text-[13px] leading-5 text-white shadow-nav"
    >
      <Icon size={18} aria-hidden className={cn("mt-px shrink-0", className)} />
      <p className="min-w-0 flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => onDismiss(toast.id)}
        className={`-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 hover:text-white ${ring}`}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/** Store-driven toast queue, top of the phone frame. */
export function ToastHost() {
  const { state, dispatch } = usePreview();
  const dismiss = useCallback((id: string) => dispatch({ type: "toast/dismiss", id }), [dispatch]);
  if (state.toasts.length === 0) return null;
  return (
    <DeviceOverlay>
      <div aria-live="polite" className="pointer-events-none absolute inset-x-3 top-14 z-50 flex flex-col gap-2">
        {state.toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </DeviceOverlay>
  );
}
