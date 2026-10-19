"use client";

import { useEffect, useState } from "react";
import { TRANSFER_BANKS } from "@/lib/transfer-banks";
import { Action, Panel } from "../../settings-ui";
import { addWarned, loadWarned, onEngineChange, removeWarned, type WarnedRow } from "./sim";

const LEVEL_LABEL = { danger: "Nguy hiểm", suspicious: "Nghi ngờ" };

/** Mock warning list (SIMO stand-in): view, add, remove. Never says an account is safe. */
export function WarnedPanel() {
  const [rows, setRows] = useState<WarnedRow[]>([]);
  const [disclaimer, setDisclaimer] = useState("Dữ liệu giả lập (mock)");
  const [account, setAccount] = useState("");
  const [bank, setBank] = useState("");
  const [level, setLevel] = useState<WarnedRow["level"]>("danger");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadWarned().then(body => {
        if (!active) return;
        setRows(body.accounts);
        setDisclaimer(body.disclaimer);
      }).catch(() => { if (active) setStatus("Không đọc được danh sách cảnh báo."); });
    };
    refresh();
    const stop = onEngineChange(refresh);
    return () => { active = false; stop(); };
  }, []);

  const add = async () => {
    setStatus("");
    try {
      setRows(await addWarned({ account: account.trim(), bank, level, note: note.trim() }));
      setAccount("");
      setNote("");
      setStatus("Đã thêm vào danh sách cảnh báo (mock).");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không thêm được số cảnh báo.");
    }
  };

  const remove = async (row: WarnedRow) => {
    setStatus("");
    try {
      setRows(await removeWarned(row.account, row.bank));
      setStatus("Đã xóa khỏi danh sách cảnh báo (mock).");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không xóa được số cảnh báo.");
    }
  };

  return <Panel title="Danh sách cảnh báo (mock)">
    <div className="py-4">
      <p className="mb-3 text-sm text-muted">{disclaimer}</p>
      {rows.map(row => <div key={`${row.account}-${row.bank}`} className="settings-row items-start">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{row.account}</span>
          <span className="mt-1 block text-sm text-muted">{row.bank || "Mọi ngân hàng"} · {LEVEL_LABEL[row.level]}{row.note ? ` · ${row.note}` : ""} · mock</span>
        </span>
        <button type="button" className="shrink-0 text-sm font-semibold text-primary" onClick={() => void remove(row)}>Xóa</button>
      </div>)}
      <label className="mb-4 mt-4 block">
        <span className="mb-2 block text-sm font-medium">Số tài khoản</span>
        <input className="settings-input w-full" inputMode="numeric" value={account} onChange={e => setAccount(e.target.value)} placeholder="Ít nhất 6 số" />
      </label>
      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">Ngân hàng</span>
        <select className="settings-input w-full" value={bank} onChange={e => setBank(e.target.value)}>
          <option value="">Mọi ngân hàng</option>
          {TRANSFER_BANKS.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
      </label>
      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">Mức</span>
        <select className="settings-input w-full" value={level} onChange={e => setLevel(e.target.value as WarnedRow["level"])}>
          <option value="danger">Nguy hiểm</option>
          <option value="suspicious">Nghi ngờ</option>
        </select>
      </label>
      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">Ghi chú</span>
        <input className="settings-input w-full" value={note} maxLength={200} onChange={e => setNote(e.target.value)} />
      </label>
      <Action disabled={!/^[\d\s.-]{6,34}$/.test(account.trim())} onClick={() => void add()}>Thêm vào danh sách</Action>
      {status && <p className="mt-3 text-sm text-muted" role="status">{status}</p>}
    </div>
  </Panel>;
}
