"use client";

import { ScanFace } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { Action } from "../settings-ui";

/** Simulated face check before a sensitive change. `onConfirm` should also close the sheet. */
export function ConfirmFaceSheet({ open, title, message, confirmLabel = "Xác thực", onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return <Sheet open={open} title={title} onClose={onClose}>
    <p className="mb-5 text-sm leading-relaxed">{message}</p>
    <div className="mb-5 flex items-center gap-3 rounded-[20px] border border-border p-4">
      <ScanFace size={36} className="shrink-0 text-primary" aria-hidden />
      <p className="text-sm leading-relaxed text-muted">Xác thực khuôn mặt (giả lập). Bản demo không mở camera.</p>
    </div>
    <Action onClick={onConfirm}>{confirmLabel}</Action>
  </Sheet>;
}
