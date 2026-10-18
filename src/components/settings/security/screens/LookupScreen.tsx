"use client";

import { useState } from "react";
import { SearchCheck } from "lucide-react";
import { TRANSFER_BANKS } from "@/lib/transfer-banks";
import { Action, Panel } from "../../settings-ui";

type Result = { level: "danger" | "suspicious" | "none"; label: string; note: string | null; disclaimer: string };

const TONE: Record<Result["level"], string> = {
  danger: "bg-negative-soft text-negative",
  suspicious: "bg-warning-soft text-text",
  none: "bg-surface-tint text-text",
};

// UC 10: results never say "an toàn"; "Chưa thấy dấu hiệu" still asks for care.
const HINT: Record<Result["level"], string> = {
  danger: "Không chuyển tiền tới tài khoản này. Nếu đã chuyển, vào Khẩn cấp ngay.",
  suspicious: "Tài khoản này từng bị báo cáo. Gọi điện xác nhận với người nhận trước khi chuyển.",
  none: "Chưa có trong danh sách cảnh báo. Vẫn kiểm tra kỹ người nhận trước khi chuyển.",
};

/** Hub Security › Tra cứu tài khoản (UC 10): check an account against the fraud warning list (mock). */
export function LookupScreen() {
  const [account, setAccount] = useState("");
  const [bank, setBank] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[\d\s.-]{6,34}$/.test(account.trim());

  async function lookup() {
    setError(null);
    setResult(null);
    try {
      const query = new URLSearchParams({ account: account.trim(), ...(bank ? { bank } : {}) });
      const res = await fetch(`/api/security/lookup?${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as Result);
    } catch {
      setError("Chưa tra cứu được. Bạn thử lại sau ít phút.");
    }
  }

  return <>
    <Panel><div className="flex gap-3 py-5">
      <SearchCheck size={30} className="shrink-0 text-primary" aria-hidden />
      <p className="text-sm leading-relaxed">Kiểm tra số tài khoản trước khi chuyển cho người nhận mới. Kết quả có 3 mức: Nguy hiểm, Nghi ngờ, Chưa thấy dấu hiệu.</p>
    </div></Panel>
    <Panel><div className="flex flex-col gap-4 py-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Số tài khoản</span>
        <input id="lookup-account" className="settings-input w-full" inputMode="numeric" value={account} onChange={e => setAccount(e.target.value)} placeholder="Nhập số tài khoản" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Ngân hàng (không bắt buộc)</span>
        <select id="lookup-bank" className="settings-input w-full" value={bank} onChange={e => setBank(e.target.value)}>
          <option value="">Mọi ngân hàng</option>
          {TRANSFER_BANKS.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
      </label>
    </div></Panel>
    <Action disabled={!valid} onClick={() => void lookup()}>Tra cứu</Action>
    {error && <p role="alert" className="px-1 text-sm text-negative">{error}</p>}
    {result && (
      <section role="status" data-testid="lookup-result" className={`rounded-[20px] p-4 ${TONE[result.level]}`}>
        <p className="text-lg font-bold">{result.label}</p>
        {result.note && <p className="mt-1 text-sm">Loại cảnh báo: {result.note}</p>}
        <p className="mt-2 text-sm leading-relaxed">{HINT[result.level]}</p>
        <p className="mt-3 text-xs opacity-80">{result.disclaimer}</p>
      </section>
    )}
  </>;
}
