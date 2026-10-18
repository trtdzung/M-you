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

/** Comma-grouped amount, consistent with the simulated app. */
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
    <div className="transfer-receipt flex min-h-full flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 pb-6 pt-[calc(var(--safe-area-top)+0.25rem)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/msb-logo.png" alt="MSB" className="h-8 w-auto" />
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Về trang chủ"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-text transition-colors hover:bg-surface/80"
        >
          <Home size={20} strokeWidth={2} />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-[calc(24px+var(--safe-area-bottom))]">
        <Card className="transfer-card flex flex-col overflow-hidden" padding="none">
          <div className="flex items-start gap-3 px-5 pt-6 pb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon_success.png" alt="" aria-hidden className="mt-0.5 h-14 w-14 shrink-0" />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-positive">Chuyển tiền thành công</p>
              <p className="mt-1 tabular-nums text-text">
                <span className="text-[28px] font-bold">{formatVndComma(done.amount)}</span>{" "}
                <span className="text-[24px] font-semibold text-muted">{done.currency}</span>
              </p>
              <p className="mt-1 text-sm text-muted">{formatDateTime(done.executedAt)}</p>
            </div>
          </div>

          <div className="mx-5 flex flex-col border-t border-[#dfe5ee]">
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
                  <p className="truncate text-base font-bold text-text">{toPlainUpper(done.recipientName)}</p>
                  <p className="mt-1 truncate text-sm text-muted">
                    {done.recipientBankName && <span>{done.recipientBankName} · </span>}
                    <span className="tabular-nums">{done.recipientAccountNumber ?? done.recipientAccountMasked}</span>
                  </p>
                </div>
              </div>
            </Row>
            <Row label="Người chuyển">
              <div className="flex items-center gap-2.5">
                {senderBank && <BankLogo bank={senderBank} />}
                <p className="truncate text-base font-bold text-text">{toPlainUpper(done.senderName)}</p>
              </div>
            </Row>
            <Row label="Nội dung chuyển tiền">
              <p className="text-base font-medium text-text">{memoText}</p>
            </Row>
            <Row label="Phí (bao gồm VAT)">
              <p className="text-base font-medium text-text">Miễn phí</p>
            </Row>
          </div>

          {fundError && (
            <p role="alert" className="mx-5 mb-3 rounded-2xl bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
              {fundError}
            </p>
          )}

          {fundResult && fundResult.createdIds.length > 0 && (
            <AutoFundResultBanner targetLabel={fundResult.targetLabel} donors={fundResult.donors} />
          )}

          {createdTxnId && <TransferCategorizeSection txnId={createdTxnId} sourceJarId={createdSourceJarId} amount={done.amount} />}

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center justify-center gap-1 border-b border-border py-4 text-base font-semibold text-primary"
          >
            {showDetails ? "Ẩn chi tiết" : "Chi tiết giao dịch"}
            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showDetails && (
            <div className="mx-5 flex flex-col divide-y divide-border border-b border-border">
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

          <div className="flex justify-center px-5 py-5">
            <button
              type="button"
              onClick={onSaveRecipient}
              disabled={recipientSaved}
              className="flex flex-col items-center gap-1.5 text-primary disabled:text-positive"
            >
              <UserPlus size={28} strokeWidth={1.8} />
              <span className="text-sm font-medium text-text">{recipientSaved ? "Đã lưu" : "Lưu người nhận"}</span>
            </button>
          </div>
        </Card>

        <div className="mt-auto grid grid-cols-2 gap-4 pt-4">
          <button type="button" onClick={() => {}} className="flex min-h-12 items-center justify-center gap-2 rounded-[9px] border border-primary bg-white text-base font-semibold text-primary">
            <Share2 size={18} />
            Chia sẻ
          </button>
          <button
            type="button"
            onClick={() => router.push("/transfer")}
            className="login-submit"
          >
            Giao dịch khác
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3">
      <span className="text-[15px] text-muted">{label}</span>
      {children}
    </div>
  );
}
