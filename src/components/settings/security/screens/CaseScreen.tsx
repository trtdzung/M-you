"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/primitives";
import { usePersona } from "@/providers/context";
import { CASE_FIELDS, CASE_DOSSIER_TITLE, CASE_GUIDANCE, MAX_CASE_IMAGE_BYTES, type FraudCase } from "@/lib/security/case-types";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import { Action, Notice, Panel } from "../../settings-ui";
import { SourceLine } from "@/components/security/InterventionCopy";

/** Fixed rule interview; A07 can enrich the questions without receiving images. */
export function CaseScreen() {
  const { persona } = usePersona();
  const [item, setItem] = useState<FraudCase | null>(null);
  const [answers, setAnswers] = useState<string[]>(Array(CASE_FIELDS.length).fill(""));
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  useEffect(() => {
    let active = true;
    setItem(null);
    setBusy(true);
    void fetch("/api/security/cases", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif: persona.cif, action: "open" }) }).then(async response => {
      if (!response.ok) throw new Error();
      const next = (await response.json()).case as FraudCase;
      if (!active) return;
      setItem(next); setAnswers(next.answers);
      const missing = next.answers.findIndex(value => !value.trim());
      setStep(missing < 0 ? CASE_FIELDS.length : missing);
      setError(null);
    }).catch(() => { if (active) setError("Không thể tải hồ sơ. Vui lòng thử lại."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [persona.cif]);
  async function next() {
    if (await request("save", { answers })) setStep(current => Math.min(CASE_FIELDS.length, current + 1));
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
    <SourceLine intervention={{ source: "rule" }} />
    {error && <Notice>{error}</Notice>}
    {!item ? <Notice>{busy ? "Đang tải hồ sơ…" : "Hồ sơ chưa tải được."}</Notice> : <>
      <Panel title={step === CASE_FIELDS.length ? CASE_DOSSIER_TITLE : SCENARIO_COPY.SC2.situation}>
        <p className="py-3 text-xs text-muted">{item.id} · {item.status === "draft" ? "Bổ sung sau" : item.status === "submitted" ? "Đã gửi hồ sơ" : "Hồ sơ có cập nhật"}</p>
        {step < CASE_FIELDS.length ? <div className="pb-4">
          <label htmlFor="case-answer" className="mb-2 block font-semibold">{CASE_FIELDS[step]}</label>
          <input id="case-answer" type={step === 1 ? "number" : "text"}
            min={step === 1 ? 1 : undefined} maxLength={500} value={answers[step]} disabled={busy}
            onChange={event => setAnswers(current => current.map((value, i) => i === step ? event.target.value : value))}
            className="h-12 w-full rounded-[10px] border border-border bg-surface-muted px-3 text-base" />
          <Action disabled={busy || !answers[step].trim() || (step === 1 && !(Number(answers[step]) > 0))} onClick={() => void next()}>Tiếp theo</Action>
        </div> : <dl className="space-y-3 py-4">{CASE_FIELDS.map((field, i) => <div key={field}><dt className="text-sm text-muted">{field}</dt><dd className="break-words font-semibold">{i === 1 && Number.isFinite(Number(answers[i])) ? `${Number(answers[i]).toLocaleString("en-US")} VND` : answers[i]}</dd></div>)}</dl>}
        <div className="flex flex-wrap gap-2 pb-4">
          <Action disabled={busy || answers.some(value => !value.trim())} onClick={() => void request("submit", { answers })}>{SCENARIO_COPY.SC2.chips[0]}</Action>
          <Action disabled={busy || item.attachments.length >= 3} onClick={() => setUploading(true)}>{SCENARIO_COPY.SC2.chips[1]}</Action>
          <button type="button" disabled={busy} className="text-sm font-semibold text-primary" onClick={() => void request("save", { answers })}>{SCENARIO_COPY.SC2.chips[2]}</button>
        </div>
      </Panel>
      {item.status !== "draft" && <Notice>{CASE_GUIDANCE}</Notice>}
      <Link href="/" className="text-sm font-semibold text-primary">Trang chủ</Link>
    </>}
    <Sheet open={uploading} title={SCENARIO_COPY.SC2.chips[1]} onClose={() => setUploading(false)}>
      <p className="mb-3 text-sm text-muted">PNG/JPEG/WebP · 2 MB/ảnh · tối đa 3 ảnh · chỉ lưu trong hồ sơ giả lập.</p>
      <input aria-label={CASE_FIELDS[4]} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        onChange={event => void upload(event.target.files?.[0])} />
    </Sheet>
  </>;
}
