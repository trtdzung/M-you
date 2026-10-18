"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/primitives";
import { AiSessionNote, SourceLine } from "@/components/security/InterventionCopy";
import { usePersona } from "@/providers/context";
import { CASE_FIELDS, CASE_DOSSIER_TITLE, CASE_GUIDANCE, MAX_CASE_IMAGE_BYTES, type FraudCase } from "@/lib/security/case-types";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import { useSecurityStore } from "@/state/security/store";
import { Action, Notice, Panel } from "../../settings-ui";

type Asked = { step: number; text: string };

/** Fixed rule interview, replaced by the agent only when protection is on and the reply is valid. */
export function CaseScreen() {
  const { persona } = usePersona();
  const aiProtect = useSecurityStore(state => state.aiProtect);
  const [item, setItem] = useState<FraudCase | null>(null);
  const [answers, setAnswers] = useState<string[]>(Array(CASE_FIELDS.length).fill(""));
  const [step, setStep] = useState(0);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const question = asked?.step === step ? asked.text : CASE_FIELDS[step];
  const source = asked?.step === step || (step === CASE_FIELDS.length && guidance) ? "agent" : "rule";

  async function request(action: string, patch: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/security/cases", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif: persona.cif, id: item?.id, action, ...patch }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const next = result.case as FraudCase;
      setItem(next); setAnswers(next.answers);
      return next;
    } catch { setError("Không thể lưu hồ sơ. Kiểm tra thông tin và thử lại."); return null; }
    finally { setBusy(false); }
  }
  async function enrich(id: string, stepIndex: number, answer: string | null) {
    if (!aiProtect) { setAsked(null); return; }
    const token = ++generation.current;
    try {
      const response = await fetch("/api/security/cases/interview", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif: persona.cif, id, ...(answer ? { answer } : {}) }) });
      if (!response.ok || token !== generation.current) return;
      const body = await response.json() as { source?: string; field?: number; nextQuestion?: unknown; guidance?: unknown };
      if (token !== generation.current || body.source !== "agent" || body.field !== stepIndex) return;
      if (typeof body.nextQuestion === "string" && body.nextQuestion.trim()) setAsked({ step: stepIndex, text: body.nextQuestion });
      if (typeof body.guidance === "string" && body.guidance.trim()) setGuidance(body.guidance);
    } catch { /* The fixed question stays. */ }
  }
  useEffect(() => {
    let active = true;
    setItem(null); setAsked(null); setGuidance(null);
    setBusy(true);
    void fetch("/api/security/cases", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif: persona.cif, action: "open" }) }).then(async response => {
      if (!response.ok) throw new Error();
      const next = (await response.json()).case as FraudCase;
      if (!active) return;
      setItem(next); setAnswers(next.answers);
      const missing = next.answers.findIndex(value => !value.trim());
      const stepIndex = missing < 0 ? CASE_FIELDS.length : missing;
      setStep(stepIndex);
      const stored = next.dossier?.guidance;
      if (typeof stored === "string") setGuidance(stored);
      setError(null);
      const filled = next.answers.map((value, index) => value.trim() ? index : -1).filter(index => index >= 0);
      void enrich(next.id, stepIndex, filled.length ? next.answers[filled[filled.length - 1]] : null);
    }).catch(() => { if (active) setError("Không thể tải hồ sơ. Vui lòng thử lại."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; generation.current += 1; };
    // enrich closes over the latest aiProtect flag for this persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.cif, aiProtect]);
  async function next() {
    const saved = await request("save", { answers });
    if (!saved) return;
    const nextStep = Math.min(CASE_FIELDS.length, step + 1);
    setAsked(null);
    setStep(nextStep);
    void enrich(saved.id, nextStep, answers[step]);
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_CASE_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Ảnh PNG/JPEG/WebP tối đa 2 MB, tối đa 3 ảnh."); return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file);
      });
      if (await request("save", { answers, attachment: { name: file.name, mime: file.type, base64 } })) setUploading(false);
    } catch { setError("Không thể tải ảnh. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  return <>
    <AiSessionNote />
    <SourceLine intervention={{ source }} />
    {error && <Notice>{error}</Notice>}
    {!item ? <Notice>{busy ? "Đang tải hồ sơ…" : "Hồ sơ chưa tải được."}</Notice> : <>
      <Panel title={step === CASE_FIELDS.length ? CASE_DOSSIER_TITLE : SCENARIO_COPY.SC2.situation}>
        <p className="pt-3 text-sm font-medium"> {item.status === "draft" ? "Đang soạn hồ sơ" : item.status === "submitted" ? "Đã gửi hồ sơ" : "Hồ sơ có cập nhật"}</p>
        <details className="py-2"><summary className="shield-details-summary text-sm">Mã hồ sơ</summary><p className="break-all text-sm text-muted">{item.id}</p></details>
        <p className="mb-4 text-sm text-muted">{step < CASE_FIELDS.length ? `Bước ${step + 1}/${CASE_FIELDS.length} · Điền thông tin sự cố` : "Kiểm tra thông tin trước khi gửi"}</p>
        {step < CASE_FIELDS.length ? <div className="pb-4">
          <label htmlFor="case-answer" className="mb-2 block font-semibold">{question}</label>
          <input id="case-answer" type={step === 1 ? "number" : "text"}
            min={step === 1 ? 1 : undefined} maxLength={500} value={answers[step]} disabled={busy}
            onChange={event => setAnswers(current => current.map((value, i) => i === step ? event.target.value : value))}
            className="h-12 w-full rounded-[10px] border border-border bg-surface-muted px-3 text-base" />
          <Action disabled={busy || !answers[step].trim() || (step === 1 && !(Number(answers[step]) > 0))} onClick={() => void next()}>Tiếp theo</Action>
          {step > 0 && <button type="button" disabled={busy} className="shield-action mt-3" onClick={() => { setAsked(null); setStep(step - 1); }}>Quay lại thông tin trước</button>}
          {step === 4 && <p className="mt-3 text-sm leading-relaxed text-muted">Mô tả ảnh hoặc ghi chú tại đây. Dùng nút Tải ảnh để đính kèm tệp.</p>}
        </div> : <dl className="space-y-3 py-4">{CASE_FIELDS.map((field, i) => <div key={field}><dt className="text-sm text-muted">{field}</dt><dd className="break-words font-semibold">{i === 1 && Number.isFinite(Number(answers[i])) ? `${Number(answers[i]).toLocaleString("en-US")} VND` : answers[i]}</dd><button type="button" disabled={busy} className="shield-action mt-2" aria-label={`Sửa ${field}`} onClick={() => { setAsked(null); setStep(i); }}>Chỉnh sửa</button></div>)}</dl>}
        {item.attachments.length > 0 && <ul className="shield-attachments">{item.attachments.map((file, index) => <li key={index}><span>Ảnh {index + 1}</span><span className="break-all">{file.name}</span></li>)}</ul>}
        <div className="shield-case-actions pb-4">
          {step === CASE_FIELDS.length && <Action disabled={busy || answers.some(value => !value.trim())} onClick={() => void request("submit", { answers })}>{item.status === "draft" ? SCENARIO_COPY.SC2.chips[0] : "Gửi lại hồ sơ"}</Action>}
          <Action disabled={busy || item.attachments.length >= 3} onClick={() => setUploading(true)}>Tải ảnh ({item.attachments.length}/3)</Action>
          <button type="button" disabled={busy} className="text-sm font-semibold text-primary" onClick={() => void request("save", { answers })}>{SCENARIO_COPY.SC2.chips[2]}</button>
        </div>
      </Panel>
      {(guidance || item.status !== "draft") && <Notice>{(guidance && guidance !== CASE_GUIDANCE ? guidance : "Bạn có thể trình báo sự việc tới cơ quan công an và giữ lại tin nhắn, chứng từ liên quan. Theo dõi cập nhật hồ sơ trong ứng dụng; không trả phí cho người hứa lấy lại tiền.")}</Notice>}
      <Link href="/" className="text-sm font-semibold text-primary">Trang chủ</Link>
    </>}
    <Sheet open={uploading} title={SCENARIO_COPY.SC2.chips[1]} onClose={() => setUploading(false)}>
      <p className="mb-3 text-sm text-muted">PNG/JPEG/WebP · 2 MB/ảnh · tối đa 3 ảnh · chỉ lưu trong hồ sơ giả lập.</p>
      <input aria-label={CASE_FIELDS[4]} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        onChange={event => void upload(event.target.files?.[0])} />
    </Sheet>
  </>;
}
