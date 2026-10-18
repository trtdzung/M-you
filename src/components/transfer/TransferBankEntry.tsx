"use client";

import { useState } from "react";
import { ChevronDown, IdCard } from "lucide-react";
import { Card, Sheet } from "@/components/primitives";
import { maskAccount } from "@/lib/mask-account";
import { ACCOUNT_NUMBER_PATTERN, findBank, findBankByName } from "@/lib/transfer-banks";
import { TransferBankSheet } from "./TransferBankSheet";
import { BankLogo } from "./BankLogo";
import { RecipientPicker, type SelectedRecipient } from "./RecipientPicker";
import type { Beneficiary, Transaction } from "@/domain/models";

/**
 * Bước 2 của Chuyển tiền — ngân hàng ngoài MSB. Danh sách chỉ gồm các ngân
 * hàng có logo thật trong `public/logos/`; mọi ngân hàng ở đây chuyển thẳng
 * vào 1 tài khoản/thẻ, không có bước chi nhánh.
 */
export function TransferBankEntry({
  onContinue,
  beneficiaries,
  transactions,
  loading = false,
  loadError = false,
}: {
  onContinue: (recipient: SelectedRecipient) => void;
  beneficiaries: Beneficiary[];
  transactions: Transaction[];
  loading?: boolean;
  loadError?: boolean;
}) {
  const [bankId, setBankId] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientSheetOpen, setRecipientSheetOpen] = useState(false);
  const [pickedRecipient, setPickedRecipient] = useState<SelectedRecipient | null>(null);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);

  const bank = bankId ? findBank(bankId) : undefined;
  const digits = accountNumber.replace(/[\s.]/g, "");
  const accountValid = ACCOUNT_NUMBER_PATTERN.test(digits);
  const nameValid = recipientName.trim().length > 0;
  const canContinue = Boolean(pickedRecipient || bank) && accountValid && nameValid;

  function selectBank(id: string) {
    setPickedRecipient(null);
    setBankId(id);
    setBankSheetOpen(false);
  }

  function submit() {
    if (!canContinue) return;
    if (pickedRecipient) { onContinue(pickedRecipient); return; }
    if (!bank) return;
    onContinue({ name: recipientName.trim(), accountMasked: maskAccount(digits), accountNumber: digits, source: "user_typed", isNewPayee: true, bankName: bank.name });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-[calc(24px+var(--safe-area-bottom))]">
      <Card className="transfer-card flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-[15px] font-medium text-text">Ngân hàng nhận</label>
          <button
            type="button"
            onClick={() => setBankSheetOpen(true)}
            aria-label="Ngân hàng nhận"
            className="flex h-14 w-full items-center gap-2.5 rounded-[10px] border border-[#dfe5ee] bg-white px-3.5"
          >
            {bank && <BankLogo bank={bank} />}
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-text">
              {bank ? bank.name : <span className="font-normal text-muted">Chọn ngân hàng</span>}
            </span>
            <ChevronDown size={16} className="shrink-0 text-muted" />
          </button>
        </div>

        <div>
          <label htmlFor="xfer-account" className="mb-2 block text-[15px] font-medium text-text">
            Số tài khoản/Số thẻ
          </label>
          <div className="transfer-input-frame flex h-14 items-center gap-2.5 rounded-[10px] border border-[#dfe5ee] bg-white px-3.5">
            <input
              id="xfer-account"
              value={accountNumber}
              onChange={(event) => { setPickedRecipient(null); setAccountNumber(event.target.value); }}
              inputMode="numeric"
              placeholder="Nhập số tài khoản/số thẻ"
              aria-invalid={accountNumber.length > 0 && !accountValid}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
            <button type="button" onClick={() => setRecipientSheetOpen(true)} aria-label="Chọn người nhận đã lưu hoặc gần đây" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text focus-visible:outline-2 focus-visible:outline-primary">
              <IdCard size={22} aria-hidden />
            </button>
          </div>
          {accountNumber.length > 0 && !accountValid && (
            <p className="mt-1.5 text-xs text-negative">Số tài khoản/thẻ cần có 8–19 chữ số.</p>
          )}
        </div>

        <div>
          <label htmlFor="xfer-recipient-name" className="mb-2 block text-[15px] font-medium text-text">
            Tên người nhận
          </label>
          <input
            id="xfer-recipient-name"
            value={recipientName}
            onChange={(event) => { setPickedRecipient(null); setRecipientName(event.target.value); }}
            placeholder="Nhập tên người nhận"
            className="flex h-14 w-full items-center rounded-[10px] border border-[#dfe5ee] bg-white px-3.5 text-[15px] text-text outline-none placeholder:text-muted"
          />
        </div>
      </Card>

      <button
        type="button"
        disabled={!canContinue}
        onClick={submit}
        className="login-submit mt-auto shrink-0 disabled:opacity-40"
      >
        Tiếp tục
      </button>

      {recipientSheetOpen && (
        <Sheet className="transfer-sheet" title="Người thụ hưởng" onClose={() => setRecipientSheetOpen(false)}>
          <RecipientPicker beneficiaries={beneficiaries} transactions={transactions} loading={loading} loadError={loadError} onChange={(next) => {
            if (!next) return;
            const recipientBank = findBankByName(next.bankName);
            setBankId(recipientBank?.id ?? null);
            setAccountNumber(next.accountNumber);
            setRecipientName(next.name);
            setPickedRecipient(next);
            setRecipientSheetOpen(false);
          }} />
        </Sheet>
      )}
      {bankSheetOpen && (
        <TransferBankSheet onClose={() => setBankSheetOpen(false)} onSelect={selectBank} />
      )}
    </div>
  );
}
