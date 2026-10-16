"use client";

import { useState } from "react";
import { ChevronDown, IdCard } from "lucide-react";
import { Sheet, Card } from "@/components/primitives";
import { maskAccount } from "@/lib/mask-account";
import { ACCOUNT_NUMBER_PATTERN, TRANSFER_BANKS, findBank } from "@/lib/transfer-banks";
import { BankLogo } from "./BankLogo";
import type { SelectedRecipient } from "./RecipientPicker";

/**
 * Bước 2 của Chuyển tiền — ngân hàng ngoài MSB. Danh sách chỉ gồm các ngân
 * hàng có logo thật trong `public/logos/`; mọi ngân hàng ở đây chuyển thẳng
 * vào 1 tài khoản/thẻ, không có bước chi nhánh.
 */
export function TransferBankEntry({
  onContinue,
  onBack,
}: {
  onContinue: (recipient: SelectedRecipient) => void;
  onBack: () => void;
}) {
  const [bankId, setBankId] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [bankSheetOpen, setBankSheetOpen] = useState(false);

  const bank = bankId ? findBank(bankId) : undefined;
  const digits = accountNumber.replace(/[\s.]/g, "");
  const accountValid = ACCOUNT_NUMBER_PATTERN.test(digits);
  const nameValid = recipientName.trim().length > 0;
  const canContinue = Boolean(bank) && accountValid && nameValid;

  function selectBank(id: string) {
    setBankId(id);
    setBankSheetOpen(false);
  }

  function submit() {
    if (!bank || !canContinue) return;
    onContinue({ name: recipientName.trim(), accountMasked: maskAccount(digits), accountNumber: digits, source: "user_typed", isNewPayee: true, bankName: bank.name });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <button type="button" onClick={onBack} className="self-start text-sm font-semibold text-primary">
        ‹ Quay lại
      </button>

      <Card className="flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-[13px] font-medium text-muted">Ngân hàng nhận</label>
          <button
            type="button"
            onClick={() => setBankSheetOpen(true)}
            aria-label="Ngân hàng nhận"
            className="flex h-14 w-full items-center gap-2.5 rounded-2xl bg-surface-muted px-3.5"
          >
            {bank && <BankLogo bank={bank} />}
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-text">
              {bank ? bank.name : <span className="font-normal text-muted">Chọn ngân hàng</span>}
            </span>
            <ChevronDown size={16} className="shrink-0 text-muted" />
          </button>
        </div>

        <div>
          <label htmlFor="xfer-account" className="mb-2 block text-[13px] font-medium text-muted">
            Số tài khoản/Số thẻ
          </label>
          <div className="flex h-14 items-center gap-2.5 rounded-2xl bg-surface-muted px-3.5">
            <input
              id="xfer-account"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              inputMode="numeric"
              placeholder="Nhập số tài khoản/số thẻ"
              aria-invalid={accountNumber.length > 0 && !accountValid}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
            <IdCard size={19} className="shrink-0 text-text" aria-hidden />
          </div>
          {accountNumber.length > 0 && !accountValid && (
            <p className="mt-1.5 text-xs text-negative">Số tài khoản/thẻ cần có 8–19 chữ số.</p>
          )}
        </div>

        <div>
          <label htmlFor="xfer-recipient-name" className="mb-2 block text-[13px] font-medium text-muted">
            Tên người nhận
          </label>
          <input
            id="xfer-recipient-name"
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            placeholder="Nhập tên người nhận"
            className="flex h-14 w-full items-center rounded-2xl bg-surface-muted px-3.5 text-[15px] text-text outline-none placeholder:text-muted"
          />
        </div>
      </Card>

      <button
        type="button"
        disabled={!canContinue}
        onClick={submit}
        className="mt-2 flex h-13 w-full items-center justify-center rounded-full bg-primary py-3.5 text-base font-bold text-primary-fg transition-opacity disabled:opacity-40"
      >
        Tiếp tục
      </button>

      {bankSheetOpen && (
        <Sheet title="Chọn ngân hàng nhận" onClose={() => setBankSheetOpen(false)}>
          <ul className="flex flex-col divide-y divide-border">
            {TRANSFER_BANKS.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => selectBank(b.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-1 py-3 text-left text-[15px] font-medium text-text"
                >
                  <BankLogo bank={b} size="md" />
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
