"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Sheet } from "@/components/primitives";
import { primaryButton, secondaryButton } from "./styles";
import { SummaryRows, type SummaryRow } from "./SummaryRows";

/**
 * Confirmation summary before ANY money action. Shows rows + optional note,
 * then one "Xác nhận" button. Simulated: no OTP, just a reassurance line.
 */
export function ConfirmSheet({
  open,
  title,
  description,
  rows,
  note,
  confirmLabel = "Xác nhận",
  cancelLabel = "Quay lại sửa",
  onConfirm,
  onClose,
  danger,
}: {
  open: boolean;
  title: string;
  description?: string;
  rows: SummaryRow[];
  note?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet open={open} title={title} description={description} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SummaryRows rows={rows} />
        {note && <div className="text-[13px] leading-5 text-muted">{note}</div>}
        <p className="flex items-center gap-1.5 text-[12px] leading-4 text-muted">
          <ShieldCheck size={14} aria-hidden />
          Bản xem trước: không cần OTP, không có giao dịch thật.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={danger ? `${primaryButton} bg-negative` : primaryButton}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
