"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { getSecurityCif } from "@/state/security/storage";
import { pokeInterventions } from "./useInterventions";

const DRAFT_PREFIX = "msb-pfm.transfer-draft.";

/** The newest transfer draft still open in this tab (the money's next stop), if any. */
function latestDraft(): { amount: number; name: string; accountNumber?: string; accountMasked: string; recipientBankName?: string; memo: string | null } | null {
  try {
    const drafts = Object.keys(sessionStorage).filter(key => key.startsWith(DRAFT_PREFIX))
      .map(key => JSON.parse(sessionStorage.getItem(key) ?? "null"))
      .filter(Boolean);
    return drafts.at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * "Tất toán sổ" (simulated): settle a savings account early into the current
 * account. DH5's screen is «Màn rút FD»: when a transfer to a new recipient is
 * already drafted, the engine is asked right here and its red popup shows.
 */
export function FdSettleScreen({ open, accountId, balance, onClose, onDone }: {
  open: boolean;
  accountId: string;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= balance;

  async function settle() {
    const cif = getSecurityCif();
    if (!cif || !valid) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/security/fd-settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cif, accountId, amount: value }) });
      if (!res.ok) throw new Error(String(res.status));
      setMessage(`Đã tất toán ${formatVnd(value)} về tài khoản thanh toán (giả lập).`);
      const draft = latestDraft();
      if (draft) {
        await fetch("/api/security/evaluate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cif, trigger: "fd_settle_review", review: { amount: draft.amount, recipientName: draft.name, recipientAccount: draft.accountNumber ?? draft.accountMasked, recipientBank: draft.recipientBankName ?? null, memo: draft.memo } }),
        }).catch(() => {});
      }
      pokeInterventions();
      onDone();
    } catch {
      setMessage("Chưa tất toán được. Bạn thử lại sau ít phút.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Tất toán sổ tiết kiệm" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">Tất toán trước hạn: tiền về tài khoản thanh toán, lãi tính theo lãi suất không kỳ hạn. Đây là thao tác giả lập.</p>
      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium">Số tiền tất toán (tối đa {formatVnd(balance)})</span>
        <input id="fd-amount" className="settings-input w-full" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} />
      </label>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      <button type="button" disabled={!valid || busy} className="login-submit mt-5 w-full disabled:opacity-60" onClick={() => void settle()}>
        {busy ? "Đang xử lý…" : "Tất toán"}
      </button>
    </Sheet>
  );
}
