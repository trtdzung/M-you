"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { maskAccount } from "@/lib/mask-account";
import type { Beneficiary, RecipientSource, Transaction } from "@/domain/models";

export interface SelectedRecipient {
  name: string;
  accountMasked: string;
  source: RecipientSource;
  isNewPayee: boolean;
}

interface RecipientOption extends SelectedRecipient {
  id: string;
}

export function RecipientPicker({
  beneficiaries,
  transactions,
  onChange,
}: {
  beneficiaries: Beneficiary[];
  transactions: Transaction[];
  onChange: (recipient: SelectedRecipient | null) => void;
}) {
  const [tab, setTab] = useState<"saved" | "recent" | "typed">("saved");
  const [search, setSearch] = useState("");
  const [typedNumber, setTypedNumber] = useState("");
  const [typedName, setTypedName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const saved = useMemo<RecipientOption[]>(
    () => beneficiaries.map((b) => ({ id: b.id, name: b.name, accountMasked: maskAccount(b.accountNumber), source: "saved_beneficiary", isNewPayee: false })),
    [beneficiaries],
  );
  const recent = useMemo<RecipientOption[]>(() => {
    const seen = new Set<string>();
    return transactions.reduce<RecipientOption[]>((items, transaction) => {
      const number = transaction.type === "transfer" ? transaction.counterpartyAccountNumber : undefined;
      const digits = number?.replace(/\D/g, "") ?? "";
      if (!digits || seen.has(digits)) return items;
      seen.add(digits);
      items.push({ id: transaction.id, name: transaction.merchantName, accountMasked: maskAccount(digits), source: "transaction_history", isNewPayee: true });
      return items;
    }, []);
  }, [transactions]);
  const options = tab === "saved" ? saved : recent;
  const visible = options.filter((option) => `${option.name} ${option.accountMasked}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));
  const digits = typedNumber.replace(/[\s.]/g, "");
  const typedValid = /^\d{8,19}$/.test(digits);

  function select(option: RecipientOption) {
    setSelectedId(option.id);
    onChange(option);
  }

  function setTyped(value: string, name = typedName) {
    setTypedNumber(value);
    const cleaned = value.replace(/[\s.]/g, "");
    onChange(/^\d{8,19}$/.test(cleaned) ? { name: name.trim() || "Người nhận mới", accountMasked: maskAccount(cleaned), source: "user_typed", isNewPayee: true } : null);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="recipient-heading">
      <div>
        <h2 id="recipient-heading" className="text-sm font-semibold text-text">Người nhận</h2>
        <p className="mt-0.5 text-xs text-muted">Chọn người đã lưu, giao dịch gần đây hoặc tự nhập số tài khoản.</p>
      </div>
      <div className="grid grid-cols-3 rounded-xl bg-surface-muted p-1" role="tablist" aria-label="Nguồn người nhận">
        {([ ["saved", "Đã lưu"], ["recent", "Gần đây"], ["typed", "Nhập số TK"] ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setSearch(""); setSelectedId(null); onChange(null); }} className={`rounded-lg px-2 py-2 text-xs font-medium ${tab === value ? "bg-surface text-primary shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "typed" ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">Tên người nhận (tuỳ chọn)
            <input value={typedName} onChange={(event) => { setTypedName(event.target.value); setTyped(typedNumber, event.target.value); }} className={inputCls} placeholder="Người nhận mới" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">Số tài khoản
            <input value={typedNumber} onChange={(event) => setTyped(event.target.value)} inputMode="numeric" className={inputCls} placeholder="8–19 chữ số" aria-invalid={typedNumber.length > 0 && !typedValid} />
          </label>
          {typedNumber && !typedValid && <p className="text-xs text-negative">Số tài khoản cần có 8–19 chữ số (có thể dùng khoảng trắng hoặc dấu chấm).</p>}
        </div>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">Tìm người nhận</span><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputCls} pl-9`} placeholder="Tìm theo tên hoặc số TK" />
          </label>
          {visible.length === 0 ? <p className="rounded-xl bg-surface-muted p-3 text-sm text-muted">Chưa có người nhận. Bạn vẫn có thể nhập số tài khoản.</p> : (
            <div className="flex flex-col gap-2">
              {visible.map((option) => <button key={option.id} type="button" onClick={() => select(option)} className={`flex items-center justify-between rounded-xl border p-3 text-left ${selectedId === option.id ? "border-primary bg-primary-soft/40" : "border-border bg-surface"}`}>
                <span><span className="block text-sm font-medium text-text">{option.name}</span><span className="block text-xs tabular-nums text-muted">{option.accountMasked}</span></span>
                {selectedId === option.id && <span className="text-xs font-semibold text-primary">Đã chọn</span>}
              </button>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const inputCls = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
