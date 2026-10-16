"use client";

import { ArrowUpRight, CalendarRange } from "lucide-react";
import { Card } from "@/components/primitives";
import type { Beneficiary, Transaction } from "@/domain/models";
import { RecipientPicker, type SelectedRecipient } from "./RecipientPicker";

/**
 * Bước 1 của Chuyển tiền: lối tắt + chọn người nhận đã lưu hoặc gần đây.
 * "Quản lý lệnh chuyển tiền" là lối tắt trang trí, chưa có màn hình thật
 * trong prototype. Muốn chuyển sang ngân hàng khác thì bấm "Tài khoản/Số
 * thẻ" để qua Bước 2; chọn tài khoản nguồn diễn ra ở bước cuối (sau khi đã
 * có người nhận), không phải ở đây.
 */
export function TransferAccountPicker({
  beneficiaries,
  transactions,
  onSelectRecipient,
  onEnterBankDetails,
}: {
  beneficiaries: Beneficiary[];
  transactions: Transaction[];
  onSelectRecipient: (recipient: SelectedRecipient) => void;
  onEnterBankDetails: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6">
      <Card padding="none" className="grid grid-cols-2 gap-3 p-4">
        <button
          type="button"
          onClick={onEnterBankDetails}
          className="flex flex-col items-center gap-2.5 rounded-2xl py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.6px] border-primary text-primary">
            <ArrowUpRight size={19} strokeWidth={2.1} />
          </span>
          <span className="text-[13.5px] font-semibold text-text">Tài khoản/Số thẻ</span>
        </button>
        <div className="flex flex-col items-center gap-2.5 rounded-2xl py-1 text-center text-muted">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.6px] border-primary text-primary">
            <CalendarRange size={19} strokeWidth={2.1} />
          </span>
          <span className="text-[13.5px] font-semibold text-text">Quản lý lệnh chuyển tiền</span>
        </div>
      </Card>

      <Card className="flex flex-1 flex-col">
        <RecipientPicker beneficiaries={beneficiaries} transactions={transactions} onChange={(r) => r && onSelectRecipient(r)} />
      </Card>
    </div>
  );
}
