"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, Sheet } from "@/components/primitives";
import { maskAccount } from "@/lib/mask-account";
import { ACCOUNT_NUMBER_PATTERN, TRANSFER_BANKS, findBank } from "@/lib/transfer-banks";
import { BankLogo } from "./BankLogo";
import type { SelectedRecipient } from "./RecipientPicker";

const RESOLVED_NAME = "Tran Duc Dao Nguyen";

/**
 * "Lưu người nhận" — reached via the "+" icon beside the recipient search
 * field, not the "Tài khoản/Số thẻ" quick action (that stays on
 * `TransferBankEntry`). Mimics the real MSB flow: once a valid account
 * number is entered, the account holder's name resolves automatically
 * (mocked — always `RESOLVED_NAME`, no real name-lookup backend in this
 * prototype), pre-filled in a lightly-styled (but still editable) field, in
 * case the resolved name needs a manual correction. "Tên gợi nhớ" is
 * an optional label that, when filled, becomes the recipient's display name
 * instead of the resolved legal name — matching how a saved-beneficiary list
 * shows a nickname over the real name in the real app. "Thêm vào danh sách
 * yêu thích" is decorative only; there is no favorites list in this
 * prototype yet.
 */
export function TransferSaveRecipient({
  onContinue,
  onBack,
}: {
  onContinue: (recipient: SelectedRecipient) => void;
  onBack: () => void;
}) {
  const [bankId, setBankId] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [recipientName, setRecipientName] = useState(RESOLVED_NAME.toLocaleUpperCase("vi"));
  const [nickname, setNickname] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);

  const bank = bankId ? findBank(bankId) : undefined;
  const digits = accountNumber.replace(/[\s.]/g, "");
  const accountValid = ACCOUNT_NUMBER_PATTERN.test(digits);
  const canContinue = Boolean(bank) && accountValid;

  function selectBank(id: string) {
    setBankId(id);
    setBankSheetOpen(false);
  }

  function submit() {
    if (!bank || !canContinue) return;
    onContinue({
      name: nickname.trim() || recipientName.trim() || RESOLVED_NAME,
      accountMasked: maskAccount(digits),
      accountNumber: digits,
      source: "user_typed",
      isNewPayee: true,
      bankName: bank.name,
    });
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
            className="flex h-14 w-full items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5"
          >
            {bank && <BankLogo bank={bank} />}
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-text">
              {bank ? bank.name : <span className="font-normal text-muted">Chọn ngân hàng</span>}
            </span>
            <ChevronDown size={16} className="shrink-0 text-muted" />
          </button>
        </div>

        <div>
          <label htmlFor="xfer-save-account" className="mb-2 block text-[13px] font-medium text-muted">
            Số tài khoản/Số thẻ
          </label>
          <input
            id="xfer-save-account"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            inputMode="numeric"
            placeholder="Nhập số tài khoản/số thẻ"
            aria-invalid={accountNumber.length > 0 && !accountValid}
            className="h-14 w-full rounded-2xl border border-border bg-surface px-3.5 text-[15px] text-text outline-none placeholder:text-muted"
          />
          {accountNumber.length > 0 && !accountValid && (
            <p className="mt-1.5 text-xs text-negative">Số tài khoản/thẻ cần có 8–19 chữ số.</p>
          )}
        </div>

        {accountValid && (
          <div>
            <label htmlFor="xfer-save-name" className="mb-2 block text-[13px] font-medium text-muted">
              Tên người nhận
            </label>
            <input
              id="xfer-save-name"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              className="h-14 w-full rounded-2xl border border-border bg-surface px-3.5 text-[15px] text-muted outline-none"
            />
          </div>
        )}

        <div>
          <label htmlFor="xfer-nickname" className="mb-2 block text-[13px] font-medium text-muted">
            Tên gợi nhớ
          </label>
          <input
            id="xfer-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Đặt tên gợi nhớ cho người nhận"
            className="h-14 w-full rounded-2xl border border-border bg-surface px-3.5 text-[15px] text-text outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-text">Thêm vào danh sách yêu thích</span>
          <button
            type="button"
            role="switch"
            aria-checked={favorite}
            aria-label="Thêm vào danh sách yêu thích"
            onClick={() => setFavorite((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${favorite ? "bg-primary" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${favorite ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
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
