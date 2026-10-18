"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { useTestToolsStore } from "@/state/security/test-tools";
import { Panel } from "../../settings-ui";
import { TRANSFER_SCENARIOS, type ScenarioField, type TransferScenario } from "./scenarios";

const DOT = { green: "bg-positive", yellow: "bg-warning", red: "bg-negative" } as const;
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function copy(text: string) {
  // Clipboard may be blocked (permissions, insecure origin): nothing to do then.
  navigator.clipboard?.writeText(text).catch(() => {});
}

function FieldRow({ field }: { field: ScenarioField }) {
  return <div className="flex items-center gap-2 py-1.5 text-sm">
    <span className="w-24 shrink-0 text-muted">{field.label}</span>
    <span className="min-w-0 flex-1 font-semibold">{field.value}</span>
    {field.copy !== undefined && <button type="button" aria-label={`Sao chép ${field.label}`} onClick={() => copy(field.copy!)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary"><Copy size={18} aria-hidden /></button>}
  </div>;
}

function ScenarioCard({ scenario, alertHour, onSetHour }: { scenario: TransferScenario; alertHour: number | null; onSetHour: (hour: number) => void }) {
  return <article className="border-b border-border py-4 last:border-0">
    <h3 className="flex items-center gap-2 font-semibold"><span aria-hidden className={`h-3 w-3 rounded-full ${DOT[scenario.level]}`} />{scenario.name}</h3>
    <div className="mt-2">
      {scenario.fields.map(field => <FieldRow key={field.label} field={field} />)}
      <FieldRow field={{ label: "Giờ chấm", value: scenario.hour === null ? "Bất kỳ" : hourLabel(scenario.hour) }} />
    </div>
    <p className="mt-2 text-sm leading-relaxed"><strong>Mong đợi:</strong> {scenario.expected}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {scenario.hour !== null && scenario.hour !== alertHour && <button type="button" onClick={() => onSetHour(scenario.hour!)} className="rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary">Đặt giờ {hourLabel(scenario.hour)}</button>}
      <Link href="/transfer" className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">Mở màn chuyển tiền</Link>
    </div>
  </article>;
}

/** Step-by-step transfer cases to type in by hand on /transfer (no prefilled form). */
export function ScenarioPanel() {
  const alertHour = useTestToolsStore(state => state.alertHour);
  const setAlertHour = useTestToolsStore(state => state.setAlertHour);

  return <Panel title="Kịch bản chuyển tiền">
    {TRANSFER_SCENARIOS.map(scenario => <ScenarioCard key={scenario.id} scenario={scenario} alertHour={alertHour} onSetHour={setAlertHour} />)}
  </Panel>;
}
