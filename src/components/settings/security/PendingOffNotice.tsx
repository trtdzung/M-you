"use client";

import { Clock } from "lucide-react";
import { formatPendingAt } from "./pending";

/** Shown while a security decrease waits 24h; `onApply` skips the wait for the demo. */
export function PendingOffNotice({ action, at, onCancel, onApply }: { action: string; at: number; onCancel: () => void; onApply: () => void }) {
  return <div className="rounded-[20px] bg-warning-soft p-4 text-sm leading-relaxed" role="status">
    <div className="flex gap-3">
      <Clock size={21} className="shrink-0 text-warning" aria-hidden />
      <p>{action} sẽ có hiệu lực lúc {formatPendingAt(at)}. Bảo mật được giữ nguyên tới lúc đó.</p>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-8">
      <button type="button" onClick={onCancel} className="rounded-full border border-warning bg-white px-4 py-2 font-semibold text-warning">Hủy yêu cầu</button>
      <button type="button" onClick={onApply} className="text-xs text-muted underline underline-offset-4">Giả lập: đã qua 24 giờ</button>
    </div>
  </div>;
}
