"use client";

import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { getSecurityCif } from "@/state/security/storage";
import { pokeInterventions } from "./useInterventions";

/**
 * "Tất toán sổ" (simulated): settle a savings account early into the current
 * account. No risk evaluation here: the withdrawal is recorded (fd_settled) and
 * the transfer confirm screen evaluates it (DH5).
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
