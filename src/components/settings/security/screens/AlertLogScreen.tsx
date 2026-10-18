"use client";

import { useSecurityStore } from "@/state/security/store";
import { Notice, Panel } from "../../settings-ui";

const LEVEL_LABEL = { red: "Đỏ", yellow: "Vàng" } as const;
const day = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
// vi-VN joins day and month with "-", so build "dd/MM HH:mm" from parts.
const part = (at: number, type: "day" | "month") => day.formatToParts(at).find(item => item.type === type)?.value;
const atLabel = (at: number) => `${part(at, "day")}/${part(at, "month")} ${time.format(at)}`;

/** Settings › Nhật ký cảnh báo: past M-You warnings and what the customer chose, newest first. */
export function AlertLogScreen() {
  const log = useSecurityStore(state => state.alertLog);
  const entries = [...log].sort((a, b) => b.at - a.at);

  return <>
    <Panel>{entries.map(entry => <div key={entry.id} className="settings-row items-start">
      <span aria-hidden className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${entry.level === "red" ? "bg-negative" : "bg-warning"}`} />
      <span className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className="block text-muted">{atLabel(entry.at)} · Mức {LEVEL_LABEL[entry.level]}</span>
        <strong className="mt-1 block text-base">{entry.situation}</strong>
        <span className="mt-1 block">Bạn chọn: {entry.choice}</span>
        {entry.note && <span className="mt-1 block text-muted">{entry.note}</span>}
      </span>
    </div>)}</Panel>
    <Notice>Các cảnh báo do M-You, trợ lý AI của MSB, ghi lại. Nhật ký giúp bạn xem lại hoặc khiếu nại. Đây là dữ liệu demo.</Notice>
  </>;
}
