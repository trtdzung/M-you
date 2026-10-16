"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Home, Share2, UserPlus } from "lucide-react";
import { Card } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { avatarColor, initialOf } from "@/lib/avatar";
import { findBank, findBankByName } from "@/lib/transfer-banks";
import { BankLogo } from "@/components/transfer/BankLogo";
import { TransferCategorizeSection } from "@/components/transfer/TransferCategorizeSection";
import { AutoFundResultBanner } from "@/components/transfer/AutoFundResultBanner";
import type { FundResult } from "@/state/use-auto-fund";
import type { DataSource } from "@/domain/models";

export interface MockExecutedTransfer {
  recipientName: string;
  recipientAccountMasked: string;
  recipientAccountNumber: string | null;
  recipientBankName: string | null;
  senderName: string;
  amount: number;
  currency: string;
  memo: string | null;
  executedAt: string;
  transactionCode: string;
  referenceCode: string;
  source: DataSource; // always "mock" — never presented as a real MSB transfer
}

/** Comma-grouped, "VND" suffix — matches the real MSB receipt screen exactly (the rest of the app uses "₫"/period-grouping; this one screen deliberately doesn't). */
function formatVndComma(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}

/** Uppercase, diacritics-stripped — matches the real app's auto-generated memo style (e.g. "NGUYEN VIET DUNG chuyen tien"). */
function toPlainUpper(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase();
}

/**
 * The receipt shown ONLY after the debit + primary txn were stored together
 * (H14/U1). `fundError` surfaces a failed rebalance write explicitly — the money
 * did move, so the receipt is true, but the jar cover is not claimed.
 */
export function TransferSuccess({
  done,
  fundResult,
  fundError,
  createdTxnId,
  createdSourceJarId,
  recipientSaved,
  onSaveRecipient,
}: {
  done: MockExecutedTransfer;
  fundResult: FundResult | null;
  fundError: string | null;
  createdTxnId: string | null;
  createdSourceJarId: string | null;
  recipientSaved: boolean;
  onSaveRecipient: () => void;
}) {
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);
  const recipientBank = findBankByName(done.recipientBankName ?? undefined);
  const senderBank = findBank("msb");
  const memoText = done.memo ?? `${toPlainUpper(done.senderName)} chuyen tien`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(var(--safe-area-top)+0.25rem)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/msb-logo.png" alt="MSB" className="h-7 w-auto" />
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Về trang chủ"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text transition-colors hover:bg-surface/80"
        >
          <Home size={20} strokeWidth={2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <Card className="flex flex-col" padding="none">
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon_success.png" alt="" aria-hidden className="mt-0.5 h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-positive">Chuyển tiền thành công</p>
              <p className="mt-1 tabular-nums text-text">
                <span className="text-2xl font-bold">{formatVndComma(done.amount)}</span>{" "}
                <span className="text-base text-muted">{done.currency}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{formatDateTime(done.executedAt)}</p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-border border-t border-border">
            <Row label="Người nhận">
              <div className="flex items-center gap-2.5">
                {recipientBank ? (
                  <BankLogo bank={recipientBank} />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: avatarColor(done.recipientName) }}
                  >
                    {initialOf(done.recipientName)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-text">{toPlainUpper(done.recipientName)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {done.recipientBankName && <span>{done.recipientBankName} · </span>}
                    <span className="tabular-nums">{done.recipientAccountNumber ?? done.recipientAccountMasked}</span>
                  </p>
                </div>
              </div>
            </Row>
            <Row label="Người chuyển">
              <div className="flex items-center gap-2.5">
                {senderBank && <BankLogo bank={senderBank} />}
                <p className="truncate text-[15px] font-bold text-text">{toPlainUpper(done.senderName)}</p>
              </div>
            </Row>
            <Row label="Nội dung">
              <p className="text-sm text-text">{memoText}</p>
            </Row>
            <Row label="Phí (bao gồm VAT)">
              <p className="text-sm text-text">Miễn phí</p>
            </Row>
          </div>

          {fundError && (
            <p role="alert" className="mx-5 mb-3 rounded-2xl bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
              {fundError}
            </p>
          )}

          {fundResult && fundResult.createdIds.length > 0 && (
            <AutoFundResultBanner
              triggerTxnId={createdTxnId ?? ""}
              targetJarId={fundResult.targetJarId}
              targetLabel={fundResult.targetLabel}
              postedAt={fundResult.postedAt}
              donors={fundResult.donors}
              createdIds={fundResult.createdIds}
            />
          )}

          {createdTxnId && <TransferCategorizeSection txnId={createdTxnId} sourceJarId={createdSourceJarId} amount={done.amount} />}

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center justify-center gap-1 border-b border-border py-3 text-sm font-semibold text-primary"
          >
            {showDetails ? "Ẩn chi tiết" : "Chi tiết giao dịch"}
            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showDetails && (
            <div className="flex flex-col divide-y divide-border border-b border-border">
              <Row label="Hình thức">
                <p className="text-sm text-text">Chuyển nhanh 24/7</p>
              </Row>
              <Row label="Mã giao dịch">
                <p className="text-sm tabular-nums text-text">{done.transactionCode}</p>
              </Row>
              <Row label="Mã tham chiếu">
                <p className="text-sm tabular-nums text-text">{done.referenceCode}</p>
              </Row>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 px-5 py-4">
            <button type="button" onClick={() => {}} className="flex flex-col items-center gap-1.5 text-primary">
              <Share2 size={20} strokeWidth={1.8} />
              <span className="text-xs font-medium text-text">Chia sẻ</span>
            </button>
            <button
              type="button"
              onClick={onSaveRecipient}
              disabled={recipientSaved}
              className="flex flex-col items-center gap-1.5 text-primary disabled:text-positive"
            >
              <UserPlus size={20} strokeWidth={1.8} />
              <span className="text-xs font-medium text-text">{recipientSaved ? "Đã lưu" : "Lưu người nhận"}</span>
            </button>
          </div>
        </Card>

        <button
          type="button"
          onClick={() => router.push("/transfer")}
          className="mt-4 flex h-13 w-full items-center justify-center rounded-full bg-primary text-base font-bold text-primary-fg"
        >
          Giao dịch khác
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}
