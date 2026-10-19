"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { Badge, Notice, Panel } from "../../settings-ui";
import { readDraftReview } from "./draft-memory";
import { onEngineChange } from "./sim";

type Signal = { code: string; evidence: string };
type Draft = { signals: Signal[]; level: "green" | "yellow" | "red" | null; scenario: string | null; agentStatus: string; source: "agent" | "rule"; trace: { tool: string; elapsedMs: number }[] };
type Pending = { id: string; scenario: string; level: string; target: string; status: string; agentStatus: string; source: "agent" | "rule" };
type Note = { id: string; at: number; scenario: string; message: string; contacts: string[] };
type Snapshot = { draft: Draft | null; pending: Pending[]; inbox: Note[] };

const LEVEL = { green: "Xanh", yellow: "Vàng", red: "Đỏ" } as const;
const TONE = { green: "good", yellow: "warn", red: "danger" } as const;
const SOURCE = { agent: "agent", rule: "nguyên văn" } as const;
const when = (ms: number) => new Date(ms).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

function useInspect(cif: string) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const load = useCallback((active: () => boolean) => {
    const review = readDraftReview();
    void fetch("/api/security/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(review ? { cif, review } : { cif }),
    }).then(async response => {
      if (!active() || !response.ok) throw new Error();
      setData(await response.json() as Snapshot);
      setError("");
    }).catch(() => { if (active()) setError("Không đọc được engine."); });
  }, [cif]);
  useEffect(() => {
    let alive = true;
    const run = () => load(() => alive);
    run();
    const stop = onEngineChange(run);
    const timer = window.setInterval(run, 5000);
    return () => { alive = false; stop(); window.clearInterval(timer); };
  }, [load]);
  return { data, error };
}

function EngineBody({ data, loading }: { data: Snapshot | null; loading: boolean }) {
  const draft = data?.draft;
  return <div data-testid="engine-inspector" className="py-4 text-sm leading-relaxed">
    {loading && <p className="text-muted">Đang đọc…</p>}
    {!loading && !draft && <p className="text-muted">Chưa có lệnh nháp.</p>}
    {draft && <>
      <p><strong>Tín hiệu đang bật:</strong> {draft.signals.length ? draft.signals.map(signal => signal.code).join(", ") : "không có"}</p>
      {draft.signals.map(signal => <p key={signal.code} className="text-muted">{signal.code}: {signal.evidence}</p>)}
      <p className="mt-2"><strong>Mức:</strong> {draft.level ? LEVEL[draft.level] : "—"} · <strong>Kịch bản:</strong> {draft.scenario ?? "—"}</p>
      <p><strong>agent_status:</strong> {draft.agentStatus} · <strong>Nguồn câu chữ:</strong> {SOURCE[draft.source]}</p>
      <p><strong>Trace:</strong> {draft.trace.length ? draft.trace.map(step => `${step.tool} · ${step.elapsedMs} ms`).join("; ") : "để trống"}</p>
    </>}
    <p className="mt-3"><strong>Intervention đang chờ:</strong> {loading || !data?.pending.length ? (loading ? "" : "không có") : ""}</p>
    {data?.pending.map(item => <p key={item.id} className="text-muted">{item.scenario} · {LEVEL[item.level as keyof typeof LEVEL] ?? item.level} · {item.target} · {item.agentStatus} · {SOURCE[item.source]}</p>)}
  </div>;
}

function InboxBody({ notes, loading }: { notes: Note[]; loading: boolean }) {
  return <div data-testid="family-inbox" className="py-4">
    <p className="text-sm leading-relaxed text-muted">Không xem được số dư hay giao dịch. Tin chỉ báo sự việc.</p>
    {loading && <p className="mt-2 text-sm text-muted">Đang đọc…</p>}
    {!loading && !notes.length && <p className="mt-2 text-sm text-muted">Chưa có tin.</p>}
    {notes.map(note => <article key={note.id} className="border-t border-border py-3 text-sm leading-relaxed">
      <p className="flex flex-wrap items-center gap-2 font-semibold"><Badge tone="neutral">{note.scenario}</Badge> {when(note.at)}</p>
      <p className="mt-1 text-muted">Gửi tới: {note.contacts.join(", ")} (giả lập)</p>
      <p className="mt-1">{note.message}</p>
    </article>)}
  </div>;
}

/** Engine inspector and the simulated family inbox. Shared by Công cụ test and the quick sheet. */
export function EngineBoard() {
  const { persona } = usePersona();
  const { data, error } = useInspect(persona.cif);
  return <>
    <Panel title="Engine">
      {error && <p className="py-3 text-sm text-negative" role="alert">{error}</p>}
      <EngineBody data={data} loading={!data && !error} />
    </Panel>
    <Panel title="Hộp thư người thân (giả lập)">
      <InboxBody notes={data?.inbox ?? []} loading={!data && !error} />
    </Panel>
  </>;
}

/** Same board, for the quick-action sheet on every screen. */
export function EngineSheetBody() {
  const { persona } = usePersona();
  const { data, error } = useInspect(persona.cif);
  return <>
    <Notice>Dữ liệu giả lập của persona này. Fraud agent tắt thì câu chữ là nguyên văn và trace để trống.</Notice>
    {error && <p className="py-3 text-sm text-negative" role="alert">{error}</p>}
    <h3 className="mt-4 text-sm font-bold text-muted">Engine</h3>
    <EngineBody data={data} loading={!data && !error} />
    <h3 className="text-sm font-bold text-muted">Hộp thư người thân (giả lập)</h3>
    <InboxBody notes={data?.inbox ?? []} loading={!data && !error} />
  </>;
}
