import type { ScanResult } from "./scan-message";

const BADGES = {
  danger: ["Nguy hiểm", "bg-negative text-white"],
  suspicious: ["Nghi ngờ", "bg-warning-soft text-warning"],
  clear: ["Chưa thấy dấu hiệu", "bg-positive-soft text-positive"],
} as const;

/** Assistant reply for one scan. Never calls a message "safe": the lowest level is "Chưa thấy dấu hiệu". */
export function ScanResultBubble({ result }: { result: ScanResult }) {
  const [label, tone] = BADGES[result.level];
  const signs = result.manipulationSigns ?? [];
  return <div className="max-w-[92%] rounded-[20px] rounded-tl-md border border-border bg-white p-4 text-sm leading-relaxed">
    <p className="mb-2 text-xs font-semibold text-muted">{result.source === "agent" ? "M-You, trợ lý AI của MSB" : "Cảnh báo tự động"}</p>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>
      <span className="text-muted">{result.reasons.length} dấu hiệu</span>
    </div>
    {result.reasons.length > 0
      ? <ol className="mt-3 list-decimal space-y-2 pl-5">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ol>
      : <p className="mt-3">M-You chưa thấy dấu hiệu lừa đảo, nhưng hãy luôn kiểm tra mã chống giả mạo.</p>}
    {signs.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5">{signs.map(sign => <li key={sign}>{sign}</li>)}</ul>}
  </div>;
}
