"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { formatVndCompact } from "@/lib/format";
import { Action, Panel, Toggle } from "../../settings-ui";
import { CHAIN_RECIPIENT, loadAccounts, onEngineChange, pickAccount, postEvent, recordChain, screenShareOn, settleFd, type AccountLite } from "./sim";

/** Simulated events: savings settled, device, password, phone, screen share, rising transfers. */
export function EventsPanel() {
  const { persona } = usePersona();
  const [savings, setSavings] = useState<AccountLite[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [savingsId, setSavingsId] = useState("");
  const [millions, setMillions] = useState("30");
  const [sharing, setSharing] = useState(false);
  const [count, setCount] = useState("2");
  const [name, setName] = useState(CHAIN_RECIPIENT.name);
  const [account, setAccount] = useState(CHAIN_RECIPIENT.account);
  const [bank, setBank] = useState(CHAIN_RECIPIENT.bank);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadAccounts(persona.cif).then(rows => {
      const saved = rows.filter(row => row.type === "savings");
      setSavings(saved);
      setSavingsId(saved[0]?.id ?? "");
      setCurrentId(pickAccount(rows, "current")?.id ?? "");
    }).catch(() => setStatus("Không tải được tài khoản."));
    const loadShare = () => { void screenShareOn(persona.cif).then(setSharing).catch(() => {}); };
    loadShare();
    return onEngineChange(loadShare);
  }, [persona.cif]);

  const run = async (task: () => Promise<void>, done: string) => {
    setBusy(true);
    setStatus("");
    try {
      await task();
      setStatus(done);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không ghi được sự kiện.");
    } finally {
      setBusy(false);
    }
  };

  const settle = () => {
    const amount = Math.round(Number(millions.replace(",", ".")) * 1_000_000);
    if (!savingsId || !(amount > 0)) return setStatus("Chọn sổ và số triệu.");
    void run(() => settleFd(persona.cif, savingsId, amount), `Đã tất toán sổ ${millions} triệu.`);
  };

  const chain = () => {
    const n = Number(count);
    if (!currentId || !Number.isInteger(n) || n < 1 || n > 5) return setStatus("Số lệnh từ 1 đến 5.");
    void run(() => recordChain(persona.cif, currentId, n, { name: name.trim(), account: account.trim(), bank: bank.trim() }), `Đã chuyển ${n} lệnh tăng dần.`);
  };

  const share = () => {
    const next = !sharing;
    void run(async () => {
      await postEvent(persona.cif, next ? "screen_share_on" : "screen_share_off", next ? { app: "Giả lập" } : {});
      setSharing(next);
    }, next ? "Đang chia sẻ màn hình." : "Đã tắt chia sẻ màn hình.");
  };

  return <Panel title="Sự kiện giả lập">
    <div className="flex flex-col gap-4 py-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Sổ tiết kiệm</span>
        <select className="settings-input w-full" value={savingsId} onChange={e => setSavingsId(e.target.value)}>
          {savings.map(item => <option key={item.id} value={item.id}>Tiết kiệm {item.maskedNumber} · {formatVndCompact(item.balance)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Số triệu vừa tất toán</span>
        <input className="settings-input w-full" inputMode="decimal" value={millions} onChange={e => setMillions(e.target.value)} />
      </label>
      <Action disabled={busy || !savingsId} onClick={settle}>Vừa tất toán sổ</Action>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40" disabled={busy} onClick={() => void run(() => postEvent(persona.cif, "device_login", { device: "Thiết bị giả lập" }), "Đã ghi đăng nhập thiết bị mới.")}>Đăng nhập thiết bị mới</button>
        <button type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40" disabled={busy} onClick={() => void run(() => postEvent(persona.cif, "password_changed"), "Đã ghi đổi mật khẩu.")}>Đổi mật khẩu</button>
        <button type="button" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40" disabled={busy} onClick={() => void run(() => postEvent(persona.cif, "phone_changed"), "Đã ghi đổi số điện thoại.")}>Đổi SĐT</button>
      </div>
      <div className="settings-row">
        <span className="flex-1 font-semibold">Đang chia sẻ màn hình</span>
        <Toggle label="Đang chia sẻ màn hình" checked={sharing} disabled={busy} onChange={share} />
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Số lệnh tăng dần (1–5)</span>
        <input className="settings-input w-full" inputMode="numeric" value={count} onChange={e => setCount(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Người nhận</span>
        <input className="settings-input w-full" value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Số tài khoản người nhận</span>
        <input className="settings-input w-full" value={account} onChange={e => setAccount(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Ngân hàng</span>
        <input className="settings-input w-full" value={bank} onChange={e => setBank(e.target.value)} />
      </label>
      <p className="text-sm leading-relaxed text-muted">Ghi nợ thật 100.000, 200.000, … trong 10 phút qua. Lệnh kế tiếp lớn hơn sẽ nối chuỗi.</p>
      <Action disabled={busy || !currentId} onClick={chain}>Đã chuyển lệnh tăng dần</Action>
      {status && <p className="text-sm text-muted" role="status">{status}</p>}
    </div>
  </Panel>;
}
