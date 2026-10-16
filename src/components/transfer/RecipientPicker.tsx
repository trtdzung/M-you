"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { maskAccount } from "@/lib/mask-account";
import { avatarColor, initialOf } from "@/lib/avatar";
import { findBankByName } from "@/lib/transfer-banks";
import { BankLogo } from "./BankLogo";
import type { Beneficiary, RecipientSource, Transaction } from "@/domain/models";

export interface SelectedRecipient {
  name: string;
  accountMasked: string;
  /** Full (unmasked) account number — shown throughout Chuyển tiền, per product direction (never mask here). */
  accountNumber: string;
  source: RecipientSource;
  isNewPayee: boolean;
  /** Real bank name when known (saved beneficiaries) — drives a real logo instead of an initials avatar. Unknown for transaction-history recipients (no bank on record). */
  bankName?: string;
}

interface RecipientOption extends SelectedRecipient {
  id: string;
}

/**
 * "Đã lưu"/"Gần đây" recipient list — the saved-beneficiary and recent-
 * transaction-counterparty sources. Manual account-number entry lives in
 * `TransferBankEntry` now (Bước 2, reached via the "Tài khoản/Số thẻ" quick
 * action in `TransferAccountPicker`), so this component only ever picks an
 * ALREADY-KNOWN recipient — never fabricates one (invariant #3).
 */
export function RecipientPicker({
  beneficiaries,
  transactions,
  onChange,
}: {
  beneficiaries: Beneficiary[];
  transactions: Transaction[];
  onChange: (recipient: SelectedRecipient | null) => void;
}) {
  const [tab, setTab] = useState<"saved" | "recent">("saved");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const saved = useMemo<RecipientOption[]>(
    () =>
      beneficiaries.map((b) => ({
        id: b.id,
        name: b.name,
        accountMasked: maskAccount(b.accountNumber),
        accountNumber: b.accountNumber,
        source: "saved_beneficiary",
        isNewPayee: false,
        bankName: b.bankName,
      })),
    [beneficiaries],
  );
  const recent = useMemo<RecipientOption[]>(() => {
    const seen = new Set<string>();
    return transactions.reduce<RecipientOption[]>((items, transaction) => {
      const number = transaction.type === "transfer" ? transaction.counterpartyAccountNumber : undefined;
      const digits = number?.replace(/\D/g, "") ?? "";
      if (!digits || seen.has(digits)) return items;
      seen.add(digits);
      items.push({
        id: transaction.id,
        name: transaction.merchantName,
        accountMasked: maskAccount(digits),
        accountNumber: digits,
        source: "transaction_history",
        isNewPayee: true,
        bankName: transaction.counterpartyBankName,
      });
      return items;
    }, []);
  }, [transactions]);
  const options = tab === "saved" ? saved : recent;
  const visible = options.filter((option) => `${option.name} ${option.accountNumber}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));

  function select(option: RecipientOption) {
    setSelectedId(option.id);
    onChange(option);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="recipient-heading">
      <h2 id="recipient-heading" className="sr-only">Người nhận</h2>

      <div className="flex gap-6 border-b border-border" role="tablist" aria-label="Nguồn người nhận">
        {([ ["saved", "Đã lưu"], ["recent", "Gần đây"] ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => { setTab(value); setSearch(""); setSelectedId(null); onChange(null); }}
            className={`min-h-11 border-b-2 px-1 pb-3 text-base font-semibold ${tab === value ? "border-primary text-primary" : "border-transparent text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">Tìm người nhận</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-[46px] w-full rounded-2xl border-none bg-surface-muted pl-10 pr-3.5 text-sm text-text outline-none placeholder:text-muted"
          placeholder="Tên, số tài khoản"
        />
      </label>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-2 py-6 text-center">
          <p className="text-base font-bold text-text">Danh sách người nhận trống</p>
          <p className="max-w-[30ch] text-sm text-muted">Lưu thông tin người nhận để thao tác chuyển tiền nhanh và thuận tiện hơn.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {visible.map((option) => {
            const bank = findBankByName(option.bankName);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => select(option)}
                className={`flex min-h-14 items-center justify-between gap-3 border-b border-border py-3 text-left last:border-b-0 ${selectedId === option.id ? "text-primary" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {bank ? (
                    <BankLogo bank={bank} size="md" />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: avatarColor(option.name) }}
                    >
                      {initialOf(option.name)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[15.5px] font-semibold text-text">{option.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {(bank?.name ?? option.bankName) && <span>{bank?.name ?? option.bankName} · </span>}
                      <span className="tabular-nums">{option.accountNumber}</span>
                    </span>
                  </span>
                </span>
                {selectedId === option.id && <span className="shrink-0 text-xs font-semibold text-primary">Đã chọn</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
