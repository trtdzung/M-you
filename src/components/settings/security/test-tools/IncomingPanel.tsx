"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { formatVndCompact } from "@/lib/format";
import { Action, Panel } from "../../settings-ui";
import { EMPLOYER, KNOWN, STRANGER, creditAccount, creditBurst, loadAccounts, type AccountLite, type IncomeKind } from "./sim";

const KINDS: { id: IncomeKind; label: string }[] = [
  { id: "salary", label: "Lương" },
  { id: "income", label: "Thu nhập" },
  { id: "transfer", label: "Chuyển khoản" },
];

const TYPE_LABEL = { current: "Thanh toán", savings: "Tiết kiệm", credit_card: "Thẻ" };

/** Money in: a manual credit, plus the three shortcuts the scenarios need. */
export function IncomingPanel() {
  const { persona } = usePersona();
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("50000");
  const [stranger, setStranger] = useState(true);
  const [memo, setMemo] = useState("");
  const [kind, setKind] = useState<IncomeKind>("transfer");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadAccounts(persona.cif).then(rows => {
      const current = rows.filter(row => row.type === "current");
      setAccounts(current);
      setAccountId(current[0]?.id ?? "");
    }).catch(() => setStatus("Không tải được tài khoản."));
  }, [persona.cif]);

  const run = async (task: () => Promise<void>, done: string) => {
    setBusy(true);
    setStatus("");
    try {
      await task();
      setStatus(done);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không ghi được tiền vào.");
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const value = Number(amount.replace(/\D/g, ""));
    if (!accountId || !(value > 0)) return setStatus("Chọn tài khoản và số tiền.");
    const sender = stranger ? STRANGER : KNOWN;
    void run(() => creditAccount(persona.cif, accountId, value, sender, kind, memo.trim() || undefined), "Đã ghi tiền vào.");
  };

  return <Panel title="Tiền vào">
    <div className="flex flex-col gap-4 py-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Tài khoản</span>
        <select className="settings-input w-full" value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(account => <option key={account.id} value={account.id}>{TYPE_LABEL[account.type]} {account.maskedNumber} · {formatVndCompact(account.balance)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Số tiền (VND)</span>
        <input className="settings-input w-full" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Người gửi</span>
        <select className="settings-input w-full" value={stranger ? "stranger" : "known"} onChange={e => setStranger(e.target.value === "stranger")}>
          <option value="stranger">Lạ · {STRANGER.name}</option>
          <option value="known">Quen · {KNOWN.name}</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Nội dung</span>
        <input className="settings-input w-full" value={memo} maxLength={140} onChange={e => setMemo(e.target.value)} placeholder="Không bắt buộc" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Loại</span>
        <select className="settings-input w-full" value={kind} onChange={e => setKind(e.target.value as IncomeKind)}>
          {KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <Action disabled={busy || !accountId} onClick={send}>Ghi tiền vào</Action>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40" disabled={busy || !accountId} onClick={() => void run(() => creditBurst(persona.cif, accountId), "Đã ghi 3 khoản 50.000 từ người lạ.")}>3 × 50.000 từ người lạ</button>
        <button type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40" disabled={busy || !accountId} onClick={() => void run(() => creditAccount(persona.cif, accountId, 30_000_000, STRANGER, "transfer", "Chuyen khoan"), "Đã ghi 30 triệu từ người lạ.")}>30 triệu từ người lạ</button>
        <button type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40" disabled={busy || !accountId} onClick={() => void run(() => creditAccount(persona.cif, accountId, 120_000_000, EMPLOYER, "salary", "Luong"), "Đã ghi 120 triệu lương.")}>120 triệu lương</button>
      </div>
      {status && <p className="text-sm text-muted" role="status">{status}</p>}
    </div>
  </Panel>;
}
