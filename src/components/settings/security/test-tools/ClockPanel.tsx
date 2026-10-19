"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { useTestToolsStore } from "@/state/security/test-tools";
import { Panel } from "../../settings-ui";
import { DAY_MS, HOUR_MS, getClock, onEngineChange, putClock, setAccountOpened, shiftClock, type ClockView } from "./sim";

const HOURS: { hour: number | null; label: string }[] = [
  { hour: null, label: "Theo giờ thật" },
  { hour: 10, label: "10:00 (ban ngày)" },
  { hour: 23, label: "23:00 (nửa đêm)" },
];

const chip = "rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40";
const activeChip = "rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-strong";

const when = (ms: number) => new Date(ms).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

/** Engine clock: alert hour lives on the server, plus offset and the account-open date (BT1). */
export function ClockPanel() {
  const { persona } = usePersona();
  const alertHour = useTestToolsStore(state => state.alertHour);
  const [clock, setClock] = useState<ClockView | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getClock(persona.cif).then(next => {
        if (!active) return;
        setClock(next);
        useTestToolsStore.setState({ alertHour: next.alertHour });
      }).catch(() => { if (active) setStatus("Không đọc được đồng hồ."); });
    };
    refresh();
    const stop = onEngineChange(refresh);
    return () => { active = false; stop(); };
  }, [persona.cif]);

  const run = async (task: () => Promise<ClockView>, done: string) => {
    setStatus("");
    try {
      const next = await task();
      setClock(next);
      useTestToolsStore.setState({ alertHour: next.alertHour });
      setStatus(done);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Không đặt được đồng hồ.");
    }
  };

  return <Panel title="Đồng hồ">
    <div className="py-4">
      <p className="mb-3 text-sm font-medium">Giờ chấm cảnh báo</p>
      <div role="radiogroup" aria-label="Giờ chấm cảnh báo chuyển tiền" className="flex flex-col gap-2">
        {HOURS.map(option => <button key={option.label} type="button" role="radio" aria-checked={alertHour === option.hour} className={alertHour === option.hour ? activeChip : chip} onClick={() => void run(() => putClock(persona.cif, { alertHour: option.hour }), `Giờ chấm: ${option.label}.`)}>{option.label}</button>)}
      </div>
      <p className="mb-3 mt-4 text-sm leading-relaxed text-muted">Giờ chấm lưu trên đồng hồ server. Chỉ ảnh hưởng mức cảnh báo, không đổi giờ ghi trên giao dịch.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} onClick={() => void run(() => shiftClock(persona.cif, HOUR_MS), "Đã tua +1 giờ.")}>+1 giờ</button>
        <button type="button" className={chip} onClick={() => void run(() => shiftClock(persona.cif, DAY_MS), "Đã tua +1 ngày.")}>+1 ngày</button>
        <button type="button" className={chip} onClick={() => void run(() => shiftClock(persona.cif, 31 * DAY_MS), "Đã tua +31 ngày.")}>+31 ngày</button>
        <button type="button" className={chip} onClick={() => void run(() => shiftClock(persona.cif, null), "Đã về hiện tại.")}>Về hiện tại</button>
      </div>
      <p className="mb-3 mt-4 text-sm font-medium">Ngày mở tài khoản (BT1)</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} onClick={() => void run(() => setAccountOpened(persona.cif, 3), "Ngày mở tài khoản: 3 ngày trước.")}>Khách mới (3 ngày)</button>
        <button type="button" className={chip} onClick={() => void run(() => setAccountOpened(persona.cif, 31), "Ngày mở tài khoản: 31 ngày trước.")}>Ngoài 7 ngày</button>
        <button type="button" className={chip} onClick={() => void run(() => setAccountOpened(persona.cif, null), "Đã xóa ngày mở tài khoản.")}>Xóa ngày mở</button>
      </div>
      {clock && <p className="mt-3 text-sm leading-relaxed text-muted">Giờ engine: {when(clock.now)}. Giờ chấm: {when(clock.alertTime)}. Ngày mở: {clock.accountOpenedAt ? when(clock.accountOpenedAt) : "chưa đặt"}.</p>}
      {status && <p className="mt-3 text-sm text-muted" role="status">{status}</p>}
    </div>
  </Panel>;
}
