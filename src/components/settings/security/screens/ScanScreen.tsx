"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveChatDraft } from "@/insights/proactive/chat-handoff";
import { pushWithTransition } from "@/lib/view-transition";
import { usePersona } from "@/providers/context";
import { Action } from "../../settings-ui";
import { buildScanPrompt, classifyScanInput, SCAN_KIND_LABEL } from "../scan-input";

const SAMPLES = [
  "[MSB] Chuc mung quy khach duoc hoan tien 2.000.000d. Nhan ngay tai msb-hoantien.com trong 30 phut, qua thoi han se bi huy.",
  "https://msb-hoantien.com/nhan-qua",
  "0900000001",
  "Cuc thue thong bao ong/ba co khoan no thue, de nghi cung cap ma OTP de xac minh.",
];

/** Settings › Kiểm tra tin nhắn lạ: classifies the pasted text and hands the question to the M-You chat. */
export function ScanScreen() {
  const { persona } = usePersona();
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const kind = text.trim() ? classifyScanInput(text) : null;

  const check = () => {
    if (!saveChatDraft(persona.cif, buildScanPrompt(text))) { setError("Chưa mở được khung chat. Vui lòng thử lại."); return; }
    setError("");
    pushWithTransition((href) => router.push(href), "/pfm?assistant=1&insight=1");
  };

  return <>
    <p className="text-xs text-muted">M-You sẽ kiểm tra giúp bạn trong khung chat · Có thể dán link, số điện thoại, số tài khoản hoặc cả tin nhắn</p>
    <section className="settings-panel p-4">
      <label className="block"><span className="mb-2 block text-sm font-medium">Nội dung cần kiểm tra</span>
        <textarea className="settings-input min-h-28 w-full resize-y py-3" value={text} onChange={e => setText(e.target.value)} placeholder="Dán tin nhắn, link, số điện thoại hoặc số tài khoản" />
      </label>
      {kind && <p className="mt-2 text-xs text-muted" aria-live="polite">Nhận diện: {SCAN_KIND_LABEL[kind]}</p>}
      <p className="mt-3 mb-2 text-xs text-muted">Thử với mẫu</p>
      <div className="mb-4 flex flex-col gap-2">{SAMPLES.map((sample) => <button key={sample} type="button" onClick={() => setText(sample)} className="truncate rounded-full border border-border bg-white px-3 py-2 text-left text-xs" title={sample}>{sample}</button>)}</div>
      {error && <p role="alert" className="mb-2 text-xs text-negative">{error}</p>}
      <Action disabled={text.trim().length === 0} onClick={check}>Kiểm tra</Action>
    </section>
  </>;
}
