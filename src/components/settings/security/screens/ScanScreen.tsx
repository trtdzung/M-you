"use client";

import Link from "next/link";
import { useState } from "react";
import { Sheet } from "@/components/primitives";
import { useSettingsDemo } from "../../SettingsDemoContext";
import { Action } from "../../settings-ui";
import { scanMessage, type ScanResult } from "../scan-message";
import { ScanResultBubble } from "../ScanResultBubble";

const SAMPLES = [
  "[MSB] Chuc mung quy khach duoc hoan tien 2.000.000d. Nhan ngay tai msb-hoantien.com trong 30 phut, qua thoi han se bi huy.",
  "Cuc thue thong bao ong/ba co khoan no thue, de nghi cung cap ma OTP de xac minh.",
  "MSB: Giao dich 150.000d tai GRAB thanh cong. Chi tiet tai msb.com.vn",
];
const chip = "rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary";

/** Settings › Kiểm tra tin nhắn lạ: chat-style rule check by the MSB AI assistant (simulated). */
export function ScanScreen() {
  const demo = useSettingsDemo();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<{ text: string; result: ScanResult } | null>(null);
  const [reported, setReported] = useState(false);
  const flagged = checked !== null && checked.result.level !== "clear";

  return <>
    <p className="text-xs text-muted">Bạn đang trò chuyện với trợ lý AI của MSB · Kết quả giả lập</p>
    {checked && <div className="flex flex-col gap-3">
      <p className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-tr-md bg-primary-soft p-4 text-sm leading-relaxed">{checked.text}</p>
      <ScanResultBubble result={checked.result} />
      {demo.antiPhishingCode !== null
        ? <p className="text-sm leading-relaxed text-muted">Tin nhắn thật từ MSB luôn có mã <strong className="text-text">{demo.antiPhishingCode}</strong>.</p>
        : <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-muted"><span>Bật mã chống giả mạo để nhận ra tin nhắn giả ngay.</span><Link href="/settings/anti-phishing" className={chip}>Bật mã chống giả mạo</Link></div>}
      {flagged && <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} onClick={() => setReported(true)}>Báo cáo tin nhắn này</button>
        <Link href="/settings/sos" className={chip}>Tôi đã lỡ bấm link / chuyển tiền</Link>
      </div>}
    </div>}
    <section className="settings-panel p-4">
      <label className="block"><span className="mb-2 block text-sm font-medium">Nội dung cần kiểm tra</span>
        <textarea className="settings-input min-h-28 w-full resize-y py-3" value={text} onChange={e => setText(e.target.value)} placeholder="Dán tin nhắn, link hoặc số điện thoại" />
      </label>
      <p className="mt-3 mb-2 text-xs text-muted">Thử với tin nhắn mẫu</p>
      <div className="mb-4 flex flex-col gap-2">{SAMPLES.map((sample, i) => <button key={sample} type="button" onClick={() => setText(sample)} className="truncate rounded-full border border-border bg-white px-3 py-2 text-left text-xs" title={sample}>Mẫu {i + 1}: {sample}</button>)}</div>
      <Action disabled={text.trim().length === 0} onClick={() => { setChecked({ text: text.trim(), result: scanMessage(text) }); setText(""); }}>Kiểm tra</Action>
    </section>
    <Sheet open={reported} title="Báo cáo tin nhắn" onClose={() => setReported(false)}>
      <p className="mb-5 text-sm leading-relaxed" role="status">Đã ghi nhận báo cáo trong bản giả lập. Cảm ơn bạn.</p>
      <Action onClick={() => setReported(false)}>Đã hiểu</Action>
    </Sheet>
  </>;
}
