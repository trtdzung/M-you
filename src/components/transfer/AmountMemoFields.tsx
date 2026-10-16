"use client";

import { formatVnd } from "@/lib/format";
import type { Account } from "@/domain/models";

export function AmountMemoFields({ amount, memo, accounts, sourceAccountId, onAmountChange, onMemoChange, onSourceChange }: { amount: string; memo: string; accounts: Account[]; sourceAccountId: string; onAmountChange: (amount: string) => void; onMemoChange: (memo: string) => void; onSourceChange: (id: string) => void }) {
  const numericAmount = Number(amount.replace(/\D/g, ""));
  return <section className="flex flex-col gap-3" aria-labelledby="transfer-details-heading">
    <h2 id="transfer-details-heading" className="text-sm font-semibold text-text">Thông tin chuyển tiền</h2>
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">Số tiền (VND)
      <input value={amount} onChange={(event) => onAmountChange(event.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputCls} placeholder="0" />
    </label>
    <div className="flex flex-wrap gap-2">{[500_000, 1_000_000, 5_000_000].map((value) => <button key={value} type="button" onClick={() => onAmountChange(String(value))} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-primary">{formatVnd(value)}</button>)}</div>
    {numericAmount > 0 && <p className="-mt-1 text-sm font-semibold tabular-nums text-text">{formatVnd(numericAmount)}</p>}
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">Nội dung (tuỳ chọn)
      <input value={memo} onChange={(event) => onMemoChange(event.target.value)} className={inputCls} placeholder="Ví dụ: Hoàn tiền ăn trưa" />
    </label>
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">Từ tài khoản
      <select value={sourceAccountId} onChange={(event) => onSourceChange(event.target.value)} className={inputCls}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} · {account.type === "current" ? "Thanh toán" : "Tiết kiệm"} · {account.maskedNumber}</option>)}
      </select>
    </label>
  </section>;
}

const inputCls = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
