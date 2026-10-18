"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { putTransferDraft } from "@/lib/transfer-draft-store";
import { pokeInterventions } from "@/components/security/useInterventions";
import { usePersona } from "@/providers/context";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Badge, Panel } from "../../settings-ui";
import { buildScenario, type BuiltCard, type SignalProbe } from "./scenario-build";
import { SCENARIO_CARDS, expectedLine, type ScenarioCardDef, type ScenarioField, type ScenarioGroup } from "./scenarios";

const GROUPS: ScenarioGroup[] = ["BT", "Vàng", "Đỏ", "SC", "Giữ lệnh"];
const TONE = { green: "good", yellow: "warn", red: "danger" } as const;

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function FieldRow({ field }: { field: ScenarioField }) {
  return <div className="flex items-center gap-2 py-1.5 text-sm">
    <span className="w-28 shrink-0 text-muted">{field.label}</span>
    <span className="min-w-0 flex-1 font-semibold">{field.value}</span>
    {field.copy !== undefined && <button type="button" aria-label={`Sao chép ${field.label}`} onClick={() => copyText(field.copy!)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary"><Copy size={18} aria-hidden /></button>}
  </div>;
}

function SignalStatus({ signals, required }: { signals: SignalProbe[] | null; required: string[] }) {
  if (!signals) return <p className="mt-2 text-sm text-muted">Tín hiệu: bấm Dựng để đọc engine.</p>;
  const on = signals.map(signal => signal.code);
  const missing = required.filter(code => !on.includes(code));
  return <div className="mt-2 text-sm leading-relaxed">
    <p><strong>Tín hiệu đang bật:</strong> {on.length ? on.join(", ") : "không có"}{required.length > 0 && (missing.length ? ` · thiếu ${missing.join(", ")}` : " · đủ cho thẻ này")}</p>
    {signals.map(signal => <p key={signal.code} className="text-muted">{signal.code}: {signal.evidence}</p>)}
  </div>;
}

function ScenarioCard({ card, built, busy, error, onBuild, onOpen }: {
  card: ScenarioCardDef;
  built?: BuiltCard;
  busy: boolean;
  error?: string;
  onBuild: () => void;
  onOpen: () => void;
}) {
  const fields = built?.fields ?? card.fields;
  return <article className="border-b border-border py-4 last:border-0" data-testid={`scenario-${card.id}`}>
    <h3 className="flex flex-wrap items-center gap-2 font-semibold">
      <Badge tone={TONE[card.level]}>{card.level === "green" ? "Xanh" : card.level === "yellow" ? "Vàng" : "Đỏ"}</Badge>
      {card.name}
    </h3>
    <div className="mt-2">{fields.map(field => <FieldRow key={field.label} field={field} />)}</div>
    <p className="mt-2 text-sm leading-relaxed"><strong>Mong đợi:</strong> {expectedLine(card.copyId)}</p>
    <SignalStatus signals={built?.signals ?? null} required={card.signals} />
    {built?.note && <p className="mt-1 text-sm text-muted">{built.note}</p>}
    {error && <p className="mt-1 text-sm text-negative" role="alert">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={onBuild} className="rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40">Dựng</button>
      <button type="button" disabled={busy} onClick={onOpen} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Mở màn</button>
    </div>
  </article>;
}

/** One card per BT/DH/SC scenario: build the engine state, then open the screen. */
export function ScenarioPanel() {
  const router = useRouter();
  const { persona } = usePersona();
  const demo = useSettingsDemo();
  const [built, setBuilt] = useState<Record<string, BuiltCard>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = async (card: ScenarioCardDef) => {
    setBusy(card.id);
    setErrors(current => ({ ...current, [card.id]: "" }));
    try {
      const next = await buildScenario(card.id, persona.cif, () => demo.update({ passwordUpdated: false, advanced: false, faceId: false }));
      setBuilt(current => ({ ...current, [card.id]: next }));
      pokeInterventions();
    } catch (err) {
      setErrors(current => ({ ...current, [card.id]: err instanceof Error ? err.message : "Không dựng được." }));
    } finally {
      setBusy(null);
    }
  };

  const open = (card: ScenarioCardDef) => {
    const ready = built[card.id];
    if (ready?.draft) putTransferDraft(ready.draft);
    router.push(ready?.href ?? card.href);
  };

  return <Panel title="Thẻ kịch bản">
    <p className="pt-4 text-sm leading-relaxed text-muted">Mỗi thẻ dựng lại engine của persona này (xóa dữ liệu giả lập trước), ghi đúng sự kiện rồi tắt Fraud agent để màn hiện câu nguyên văn. Mở màn đi tới chỗ cảnh báo hiện. Dòng Mong đợi lấy từ bảng kịch bản.</p>
    {GROUPS.map(group => <section key={group}>
      <h2 className="pt-4 text-sm font-bold text-muted">{group}</h2>
      {SCENARIO_CARDS.filter(card => card.group === group).map(card => (
        <ScenarioCard key={card.id} card={card} built={built[card.id]} busy={busy !== null} error={errors[card.id]} onBuild={() => void run(card)} onOpen={() => open(card)} />
      ))}
    </section>)}
  </Panel>;
}
