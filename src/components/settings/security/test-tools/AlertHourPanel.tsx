"use client";

import { useTestToolsStore } from "@/state/security/test-tools";
import { Panel } from "../../settings-ui";

const OPTIONS: { hour: number | null; label: string }[] = [
  { hour: null, label: "Theo giờ thật" },
  { hour: 10, label: "10:00 (ban ngày)" },
  { hour: 23, label: "23:00 (nửa đêm)" },
];

/** Picks the simulated hour the transfer alert is judged at. */
export function AlertHourPanel() {
  const alertHour = useTestToolsStore(state => state.alertHour);
  const setAlertHour = useTestToolsStore(state => state.setAlertHour);

  return <Panel title="Giờ chấm cảnh báo chuyển tiền">
    <div className="py-4">
      <div role="radiogroup" aria-label="Giờ chấm cảnh báo chuyển tiền" className="flex flex-col gap-2">
        {OPTIONS.map(option => <button key={option.label} type="button" role="radio" aria-checked={alertHour === option.hour} onClick={() => setAlertHour(option.hour)} className={`rounded-full border py-2.5 text-sm font-semibold ${alertHour === option.hour ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-white"}`}>{option.label}</button>)}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">Chỉ ảnh hưởng mức cảnh báo ở màn xác nhận, không đổi giờ ghi trên giao dịch.</p>
    </div>
  </Panel>;
}
