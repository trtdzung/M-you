"use client";

import { useState } from "react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import { Sheet } from "@/components/primitives";
import { useSecurityStore } from "@/state/security/store";
import { TEST_PRESETS } from "@/state/security/test-presets";
import { useTestToolsStore } from "@/state/security/test-tools";
import { applyAllPending, applyPreset, pendingCount, resetTestState, setAlertLog } from "./actions";
import { EngineSheetBody } from "./EnginePanel";
import { QuickSimGroups } from "./QuickSimGroups";
import { useActivePreset } from "./useActivePreset";

const HOURS: { hour: number | null; label: string }[] = [
  { hour: null, label: "Giờ thật" },
  { hour: 10, label: "10:00" },
  { hour: 23, label: "23:00" },
];

const chip = (active = false) => `rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${active ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-white"}`;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-4"><h3 className="mb-2 text-sm font-medium text-muted">{title}</h3><div className="flex flex-wrap gap-2">{children}</div></section>;
}

/** Tester actions applied in place, without leaving the screen under test. One tap each, no confirm. */
export function QuickActionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alertHour = useTestToolsStore(state => state.alertHour);
  const setAlertHour = useTestToolsStore(state => state.setAlertHour);
  const security = useSecurityStore(useShallow(state => ({ hydrated: state.hasHydrated, pendingOff: state.pendingOff, emergencyContacts: state.emergencyContacts, logCount: state.alertLog.length })));
  const [done, setDone] = useState<string | null>(null);
  const [engine, setEngine] = useState(false);
  const activePreset = useActivePreset();
  const pending = pendingCount(security);

  const run = (action: () => void | Promise<void>, message: string) => {
    void Promise.resolve(action()).then(() => setDone(message)).catch(err => setDone(err instanceof Error ? err.message : "Không thực hiện được."));
  };

  return <Sheet open={open} title={engine ? "Engine" : "Thao tác nhanh (test)"} onClose={() => { setDone(null); setEngine(false); onClose(); }}>
    {engine ? <><EngineSheetBody /><button type="button" className={`${chip()} mb-4`} onClick={() => setEngine(false)}>Thao tác nhanh</button></> : !security.hydrated ? <p className="mb-5 text-sm text-muted">Đang tải cài đặt bảo mật…</p> : <>
      <Group title="Giờ chấm cảnh báo">
        {HOURS.map(option => <button key={option.label} type="button" aria-pressed={alertHour === option.hour} className={chip(alertHour === option.hour)} onClick={() => run(() => setAlertHour(option.hour), `Giờ chấm: ${option.label}.`)}>{option.label}</button>)}
      </Group>
      <QuickSimGroups onDone={setDone} />
      <Group title="Đặt nhanh trạng thái">
        {TEST_PRESETS.map(preset => <button key={preset.id} type="button" aria-pressed={activePreset === preset.id} className={chip(activePreset === preset.id)} onClick={() => run(() => applyPreset(preset), `Đã áp dụng '${preset.label}'.`)}>{preset.label}</button>)}
      </Group>
      <Group title="Engine">
        <button type="button" className={chip()} onClick={() => setEngine(true)}>Xem Engine và hộp thư</button>
      </Group>
      <Group title="Khác">
        <button type="button" className={chip()} disabled={pending === 0} onClick={() => run(applyAllPending, "Đã áp dụng mọi yêu cầu đang chờ.")}>Bỏ qua chờ 24 giờ{pending > 0 ? ` (${pending})` : ""}</button>
        <button type="button" className={chip()} onClick={() => run(() => setAlertLog("clear"), "Đã xóa hết nhật ký cảnh báo.")}>Xóa nhật ký ({security.logCount})</button>
        <button type="button" className={chip()} onClick={() => run(() => setAlertLog("demo"), "Đã đưa nhật ký về dữ liệu demo.")}>Nhật ký demo</button>
        <button type="button" className={chip()} onClick={() => run(resetTestState, "Đã xóa dữ liệu engine và đặt lại về mặc định.")}>Đặt lại tất cả</button>
      </Group>
      <p className="mb-4 min-h-5 text-sm text-muted" role="status">{done}</p>
    </>}
    <Link href="/settings/test-tools" onClick={onClose} className="mb-2 block text-center text-sm font-semibold text-primary">Mở màn Công cụ test đầy đủ</Link>
  </Sheet>;
}
