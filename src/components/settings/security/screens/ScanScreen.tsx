"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Sheet } from "@/components/primitives";
import { HandbookSheet } from "@/components/security/HandbookSheet";
import { AiSessionNote } from "@/components/security/InterventionCopy";
import { SCENARIO_COPY } from "@/lib/security/scenario-copy";
import { usePersona } from "@/providers/context";
import { useSecurityStore } from "@/state/security/store";
import { Action } from "../../settings-ui";
import { scanMessage, type ScanLevel, type ScanResult } from "../scan-message";
import { ScanResultBubble } from "../ScanResultBubble";

const SAMPLES = [
  "Tin nhắn nhắc chương trình hoàn tiền 2 triệu của MSB. Nhận ngay tại msb-hoantien.com trong 30 phút.",
  "Cuc thue thong bao ong/ba co khoan no thue, de nghi cung cap ma OTP de xac minh.",
  "MSB: Giao dich 150.000d tai GRAB thanh cong. Chi tiet tai msb.com.vn",
];
const chip = "shield-action";
const RANK: Record<ScanLevel, number> = { clear: 0, suspicious: 1, danger: 2 };
const [reportLabel, similarLabel] = SCENARIO_COPY.BT7.chips;

type View = ScanResult & { manipulationSigns: string[]; source: "rule" | "agent" };

function agentUpgrade(value: unknown, rule: View): value is View {
  if (!value || typeof value !== "object") return false;
  const row = value as View;
  return row.source === "agent" && row.level in RANK && RANK[row.level] >= RANK[rule.level] && Array.isArray(row.reasons) && Array.isArray(row.manipulationSigns);
}

/** Settings › Kiểm tra tin nhắn lạ. The rule answer shows at once; the agent may replace it later. */
export function ScanScreen() {
  const { persona } = usePersona();
  const antiPhishingCode = useSecurityStore(state => state.antiPhishingCode);
  const aiProtect = useSecurityStore(state => state.aiProtect);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<{ text: string; result: View } | null>(null);
  const [reported, setReported] = useState(false);
  const [handbook, setHandbook] = useState(false);
  const generation = useRef(0);
  const flagged = checked !== null && checked.result.level !== "clear";

  const check = () => {
    const raw = text.trim();
    if (!raw) return;
    const rule: View = { ...scanMessage(raw), manipulationSigns: [], source: "rule" };
    const id = ++generation.current;
    setChecked({ text: raw, result: rule });
    setText("");
    setReported(false);
    if (!aiProtect) return;
    void fetch("/api/security/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw, cif: persona.cif }) })
      .then(async response => {
        if (!response.ok || id !== generation.current) return;
        const body: unknown = await response.json();
        if (id !== generation.current || !agentUpgrade(body, rule)) return;
        setChecked({ text: raw, result: body });
      })
      .catch(() => {});
  };

  return <>
    <AiSessionNote />
    {checked && <div className="flex flex-col gap-3">
      <p className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-tr-md bg-primary-soft p-4 text-sm leading-relaxed">{checked.text}</p>
      <ScanResultBubble result={checked.result} />
      {antiPhishingCode !== null
        ? <p className="text-sm leading-relaxed text-muted">Trên kênh hỗ trợ, đối chiếu mã riêng <strong className="text-text">{antiPhishingCode}</strong>.</p>
        : <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-muted"><span>Thêm mã riêng để hỗ trợ nhận diện thông điệp.</span><Link href="/settings/anti-phishing" className={chip}>Bật mã chống giả mạo</Link></div>}
      {flagged && <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} onClick={() => setReported(true)}>{reportLabel}</button>
        <button type="button" className={chip} onClick={() => setHandbook(true)}>{similarLabel}</button>
      </div>}
    </div>}
    <section className="settings-panel p-4">
      <label className="block"><span className="mb-2 block text-sm font-medium">Nội dung cần kiểm tra</span>
        <textarea className="settings-input min-h-36 w-full resize-y py-3" value={text} onChange={e => setText(e.target.value)} placeholder="Dán tin nhắn, link hoặc số điện thoại" />
      </label>
      <Action disabled={text.trim().length === 0} onClick={check}>Kiểm tra</Action>
      <details className="mt-4"><summary className="shield-details-summary">Thử với tin nhắn mẫu</summary>
      <div className="mb-4 flex flex-col gap-2">{SAMPLES.map((sample, i) => <button key={sample} type="button" onClick={() => setText(sample)} className="shield-sample" title={sample}>Mẫu {i + 1}: {sample}</button>)}</div>
      </details>
      <p className="mt-3 text-sm leading-relaxed text-muted">Kết quả giúp nhận diện dấu hiệu đáng ngờ, không thay thế xác minh từ ngân hàng. Tin nhắn mẫu chỉ phục vụ mô phỏng.</p>
    </section>
    {handbook && <HandbookSheet context="warned_scan" onClose={() => setHandbook(false)} />}
    <Sheet open={reported} title="Báo cáo tin nhắn" onClose={() => setReported(false)}>
      <p className="mb-5 text-sm leading-relaxed" role="status">Đã ghi nhận báo cáo trong bản giả lập. Cảm ơn bạn.</p>
      <Action onClick={() => setReported(false)}>Đã hiểu</Action>
    </Sheet>
  </>;
}
