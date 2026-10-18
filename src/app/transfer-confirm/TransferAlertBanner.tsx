"use client";

import { TriangleAlert } from "lucide-react";

/** Yellow Scam Shield nudge above the confirm button. The customer can confirm right away. */
export function TransferAlertBanner({ reasons }: { reasons: string[] }) {
  return (
    <div role="status" className="flex gap-3 rounded-[20px] bg-warning-soft p-4 text-sm leading-relaxed text-text">
      <TriangleAlert size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p>M-You, trợ lý AI của MSB, nhắc bạn kiểm tra lại: {reasons.map(reason => reason.charAt(0).toLowerCase() + reason.slice(1)).join("; ")}.</p>
    </div>
  );
}
