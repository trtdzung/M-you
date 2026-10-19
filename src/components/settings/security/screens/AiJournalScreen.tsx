"use client";

import { useEffect, useState } from "react";
import { usePersona } from "@/providers/context";
import { Notice, Panel } from "../../settings-ui";

type Entry = { id: string; at: number; action: string; dataUsed: string; output: string; customerDecision: string | null };

const ACTION: Record<string, string> = {
  intervene: "Soạn cảnh báo",
  diagnose: "Hỏi chẩn đoán",
  scan: "Đọc tin nhắn",
  case: "Hỏi tra soát",
  educate: "Soạn cẩm nang",
  "chat-signal": "Đọc tin trong chat",
};
const DECISION: Record<string, string> = { "đồng ý": "Đồng ý", "không": "Không đồng ý" };
const day = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
const part = (at: number, type: "day" | "month") => day.formatToParts(at).find(item => item.type === type)?.value;
const atLabel = (at: number) => `${part(at, "day")}/${part(at, "month")} ${time.format(at)}`;

/** Settings › Nhật ký AI: each fraud-agent action, the tools it used, and whether the customer agreed. */
export function AiJournalScreen() {
  const { persona } = usePersona();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setEntries(null);
    setError(false);
    void fetch(`/api/security/ai-journal?cif=${encodeURIComponent(persona.cif)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        const body = await response.json() as { entries?: Entry[] };
        if (active) setEntries(body.entries ?? []);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [persona.cif]);

  return <>
    {error && <Notice>Không tải được nhật ký. Vui lòng thử lại.</Notice>}
    {entries && entries.length === 0 && <Notice>Chưa có việc nào do trợ lý AI thực hiện.</Notice>}
    {entries && entries.length > 0 && <Panel>{entries.map(entry => <div key={entry.id} className="settings-row items-start">
      <span className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className="block text-muted">{atLabel(entry.at)} · {ACTION[entry.action] ?? entry.action}</span>
        <strong className="mt-1 block text-base">{entry.output}</strong>
        <span className="mt-1 block">Nguồn dữ liệu: {entry.dataUsed || "không dùng công cụ"}</span>
        <span className="mt-1 block">Khách hàng: {entry.customerDecision ? DECISION[entry.customerDecision] ?? entry.customerDecision : "Chưa chọn"}</span>
      </span>
    </div>)}</Panel>}
    <Notice>Nhật ký ghi việc trợ lý AI đã làm và bạn đồng ý hay không. Nguồn dữ liệu chỉ là tên công cụ, không phải dữ liệu của bạn.</Notice>
  </>;
}
