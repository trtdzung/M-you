"use client";

import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";
import { Hourglass, Phone } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { Diagnosis } from "./Diagnosis";
import { Emphasized } from "./InterventionCopy";
import { TRANSFER_SUPPORT_HREF, transferSupportHref, transferHoldCopy, transferRecipientParts, type TransferDetails } from "@/lib/security/transfer-copy";
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
export function HoldScreen({ cif, hold: initial, onSend, onCancelled, details }: {
  cif: string;
  hold: Hold;
  details?: TransferDetails;
  onSend: () => void;
  onCancelled: () => void;
}) {
  const router = useRouter();
  const [hold, setHold] = useState(initial);
  const [left, setLeft] = useState(initial.remainingMs);
  const [answer, setAnswer] = useState<"Có" | "Không" | null>(null);

  useEffect(() => {
    setAnswer(null);
  }, [initial.id]);

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
  const copy = transferHoldCopy({ amount: hold.amount, recipientName: hold.recipientName }, left);

  const recipient = details ? transferRecipientParts(details) : null;

  return (
    <div data-testid="shield-hold" className="hold-screen">
      <div className="hold-screen-status" role="status">
        <span className="transfer-alert-icon hold-screen-icon" aria-hidden="true"><Hourglass size={20} /></span>
        <p className="hold-screen-title">{released ? "Đã hết thời gian giữ" : "Đang giữ giao dịch"}</p>
        <p className="hold-screen-countdown">{mmss(left)}</p>
        <p className="hold-screen-message">
          <Emphasized {...copy.message} />
        </p>
      </div>
      {details && recipient && <div className="transfer-alert-recipient">
        <span className="transfer-alert-avatar" aria-hidden="true">{recipient.initials}</span>
        <div className="transfer-alert-recipient-copy">
          <p className="transfer-alert-recipient-name">{recipient.name}</p>
          <p className="transfer-alert-recipient-meta">{recipient.bankAccount}</p>
        </div>
        {details.amount !== undefined && <p className="transfer-alert-amount">{formatVnd(details.amount)}</p>}
      </div>}
      <div className={`hold-screen-diagnosis ${answer === "Có" ? "hidden" : ""}`}>
        <Diagnosis cif={cif} id={hold.id} question={copy.question} onAnswer={setAnswer} sourceLine={false} />
      </div>
      {answer === "Có" && (
        <div className="transfer-alert-content">
          <p className="transfer-alert-guidance">
            <Emphasized {...copy.yes.message} />
          </p>
          <ol className="transfer-alert-checklist">
            {copy.yes.steps.map((step, index) => (
              <li key={step}><span className="transfer-alert-step" aria-hidden="true">{index + 1}</span><span>{step}</span></li>
            ))}
          </ol>
        </div>
      )}
      <div className="transfer-alert-actions">
        <button type="button" className="transfer-alert-stop" onClick={() => void cancel()}>
          {copy.primary}
        </button>
        {answer === "Có" ? (
          <a className="transfer-alert-support" href={TRANSFER_SUPPORT_HREF} onClick={event => {
              event.preventDefault();
              router.push(transferSupportHref(window.location.pathname + window.location.search));
            }}>
            <Phone size={16} aria-hidden="true" />{copy.yes.secondary}
          </a>
        ) : (
          <>
            {released && (
              <button type="button" className="transfer-alert-proceed" onClick={() => void send()}>
                {copy.secondary}
              </button>
            )}
            <p className="hold-screen-footnote">{copy.footnote}</p>
          </>
        )}
      </div>
    </div>
  );
}
