"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { CLASSIFY_QUESTIONS } from "@/lib/security/scenario-copy";
import type { Hold } from "@/lib/security/holds";

const POLL_MS = 3_000;

/** Ask the engine whether a confirmed transfer must wait (UC 10 b). Errors never hold a transfer. */
export async function requestTransferHold(cif: string, review: object): Promise<Hold | null> {
  try {
    const res = await fetch("/api/security/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, review }) });
    if (!res.ok) return null;
    return ((await res.json()) as { hold: Hold | null }).hold;
  } catch {
    return null;
  }
}

async function postHold(cif: string, id: string, action: "cancel" | "sent"): Promise<Hold | null> {
  try {
    const res = await fetch(`/api/security/holds/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, action }) });
    return res.ok ? ((await res.json()) as { hold: Hold }).hold : null;
  } catch {
    return null;
  }
}

const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * "Đang giữ giao dịch": MSB's system holds a transfer to a new recipient above
 * the customer's threshold. The rule releases it; the customer can cancel any
 * time. While waiting M-You asks one diagnostic question (UC 12).
 */
export function HoldScreen({ cif, hold: initial, onSend, onCancelled, onScam }: {
  cif: string;
  hold: Hold;
  onSend: () => void;
  onCancelled: () => void;
  onScam: () => void;
}) {
  const [hold, setHold] = useState(initial);
  const [left, setLeft] = useState(initial.remainingMs);

  // Server time is the truth (test tools may end the wait); count down locally between polls.
  useEffect(() => {
    const tick = window.setInterval(() => setLeft(ms => Math.max(0, ms - 1000)), 1000);
    const poll = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/security/holds/${encodeURIComponent(hold.id)}?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = ((await res.json()) as { hold: Hold }).hold;
        setHold(next);
        setLeft(next.remainingMs);
      } catch {
        // keep counting locally
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [cif, hold.id]);

  const send = async () => {
    if ((await postHold(cif, hold.id, "sent"))?.status === "sent") onSend();
  };
  const cancel = async () => {
    await postHold(cif, hold.id, "cancel");
    onCancelled();
  };
  const released = left <= 0;

  return (
    <div data-testid="shield-hold" className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-[20px] bg-warning-soft p-5 text-center" role="status">
        <Hourglass size={36} className="text-warning" aria-hidden />
        <p className="text-lg font-bold">{released ? "Đã hết thời gian giữ" : "Đang giữ giao dịch"}</p>
        <p className="text-3xl font-bold tabular-nums">{mmss(left)}</p>
        <p className="text-sm leading-relaxed">
          {formatVnd(hold.amount)} tới {hold.recipientName} là người nhận mới, vượt ngưỡng bạn đặt. Hệ thống MSB giữ giao dịch để bạn có thời gian kiểm tra. Bạn có thể hủy bất cứ lúc nào.
        </p>
      </div>
      <div className="rounded-[20px] border border-border bg-white p-4">
        <p className="text-xs font-semibold text-muted">Cảnh báo tự động</p>
        <p className="mt-2 text-sm font-semibold leading-relaxed">{CLASSIFY_QUESTIONS[0]}</p>
        <p className="mt-1 text-sm leading-relaxed">{CLASSIFY_QUESTIONS[1]}</p>
      </div>
      <button type="button" className="w-full rounded-full bg-negative py-3 text-sm font-semibold text-white" onClick={() => void cancel()}>Hủy giao dịch</button>
      <button type="button" className="w-full rounded-full border-2 border-negative bg-white py-3 text-sm font-semibold text-negative" onClick={onScam}>Tôi nghĩ mình bị lừa</button>
      <button type="button" disabled={!released} className="login-submit disabled:opacity-50" onClick={() => void send()}>
        {released ? "Chuyển ngay" : `Chuyển sau ${mmss(left)}`}
      </button>
      <p className="text-xs leading-relaxed text-muted">M-You không tự chặn tiền của bạn. Việc giữ giao dịch do hệ thống MSB thực hiện theo cài đặt của bạn.</p>
    </div>
  );
}
