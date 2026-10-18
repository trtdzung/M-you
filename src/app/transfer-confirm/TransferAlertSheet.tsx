"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/primitives";
import { useSecurityStore } from "@/state/security/store";
import { effectiveContacts } from "@/state/security/selectors";

const WAIT_SECONDS = 30;
const CHOICES = {
  stop: "Dừng lại",
  call: "Để tôi gọi người nhận",
  callback: "Để MSB gọi lại",
  proceed: "Vẫn tiếp tục",
} as const;
type Choice = keyof typeof CHOICES;

const outline = "w-full rounded-full border border-border bg-white py-3 text-sm font-semibold text-text";

/**
 * Red Scam Shield warning. Confirming opens this instead of committing; only
 * "Vẫn tiếp tục" (after the 30s wait) lets the transfer through. Every choice
 * is logged. M-You only asks; the customer decides.
 */
export function TransferAlertSheet({ open, reasons, onClose, onProceed, onNotice }: {
  open: boolean;
  reasons: string[];
  onClose: () => void;
  onProceed: () => void;
  /** Simulated follow-up message shown on the confirm screen after the sheet closes. */
  onNotice: (message: string) => void;
}) {
  const [seconds, setSeconds] = useState(WAIT_SECONDS);

  useEffect(() => {
    if (!open) return;
    setSeconds(WAIT_SECONDS);
    const timer = window.setInterval(() => setSeconds(left => Math.max(0, left - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const choose = (choice: Choice) => {
    const state = useSecurityStore.getState();
    const contacts = choice === "stop" && state.familyAlerts ? effectiveContacts(state) : [];
    const note = contacts.length > 0 ? `Đã báo người thân ${contacts.map(contact => contact.name).join(", ")} (giả lập)` : undefined;
    state.logAlert({ level: "red", situation: reasons.join("; "), choice: CHOICES[choice], ...(note ? { note } : {}) });
    onClose();
    if (choice === "proceed") onProceed();
    else if (choice === "callback") onNotice("MSB sẽ gọi lại cho bạn trong ít phút (giả lập). Giao dịch chưa được thực hiện.");
    else if (note) onNotice(`${note}. Giao dịch chưa được thực hiện.`);
  };

  return (
    <Sheet open={open} title="Khoan đã" onClose={onClose}>
      <p className="text-sm font-semibold leading-relaxed text-negative">M-You, trợ lý AI của MSB, thấy giao dịch này có dấu hiệu lừa đảo</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <p className="mt-4 rounded-[16px] bg-negative-soft p-4 text-base font-semibold leading-relaxed">Có ai đang hướng dẫn bạn chuyển khoản này qua điện thoại không?</p>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" className="w-full rounded-full bg-negative py-3 text-sm font-semibold text-white" onClick={() => choose("stop")}>{CHOICES.stop}</button>
        <button type="button" className={outline} onClick={() => choose("call")}>{CHOICES.call}</button>
        <button type="button" className={outline} onClick={() => choose("callback")}>{CHOICES.callback}</button>
        <button type="button" className={`${outline} disabled:opacity-50`} disabled={seconds > 0} onClick={() => choose("proceed")}>
          {seconds > 0 ? `${CHOICES.proceed} (${seconds} giây)` : CHOICES.proceed}
        </button>
      </div>
      <p className="mt-4 pb-2 text-xs leading-relaxed text-muted">M-You không tự chặn tiền của bạn. Bạn quyết định tiếp tục hay dừng.</p>
    </Sheet>
  );
}
