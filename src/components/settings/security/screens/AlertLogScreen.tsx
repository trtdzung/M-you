"use client";

import { Notice, Panel } from "../../settings-ui";

// demo data
const ENTRIES = [
  { at: "12/10 22:24", level: "Đỏ", situation: "Vừa tất toán sổ rồi chuyển cho người nhận mới", choice: "Dừng lại" },
  { at: "08/10 21:10", level: "Vàng", situation: "Tên giống người quen, khác số tài khoản", choice: "Để tôi gọi" },
  { at: "02/10 23:40", level: "Đỏ", situation: "Chuyển khoản lớn lúc nửa đêm, nội dung có chữ \"thuế\"", choice: "Để MSB gọi lại" },
] as const;

/** Settings › Nhật ký cảnh báo: past M-You warnings and what the customer chose. */
export function AlertLogScreen() {
  return <>
    <Panel>{ENTRIES.map(entry => <div key={entry.at} className="settings-row items-start">
      <span aria-hidden className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${entry.level === "Đỏ" ? "bg-negative" : "bg-warning"}`} />
      <span className="min-w-0 flex-1 text-sm leading-relaxed">
        <span className="block text-muted">{entry.at} · Mức {entry.level}</span>
        <strong className="mt-1 block text-base">{entry.situation}</strong>
        <span className="mt-1 block">Bạn chọn: {entry.choice}</span>
      </span>
    </div>)}</Panel>
    <Notice>Các cảnh báo do M-You, trợ lý AI của MSB, ghi lại. Nhật ký giúp bạn xem lại hoặc khiếu nại. Đây là dữ liệu demo.</Notice>
  </>;
}
