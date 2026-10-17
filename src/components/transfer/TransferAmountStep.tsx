"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Wallet } from "lucide-react";
import { Card, Money, Sheet, SourceBadge } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatVnd } from "@/lib/format";
import { avatarColor, initialOf } from "@/lib/avatar";
import { findBankByName } from "@/lib/transfer-banks";
import { jarAccent } from "@/lib/category-colors";
import { jarIcon } from "@/components/settings/jar-visuals";
import { BankLogo } from "./BankLogo";
import type { Account, Jar } from "@/domain/models";
import type { UnallocatedPoolResult } from "@/domain/engine";
import type { SelectedRecipient } from "./RecipientPicker";

const ACCOUNT_TYPE_LABEL: Record<Account["type"], string> = {
  current: "Tài khoản thanh toán",
  savings: "Tài khoản tiết kiệm",
  credit_card: "Thẻ tín dụng",
};

export const POOL_SOURCE_LABEL = "Chưa phân bổ";

/**
 * A transfer source: a real account, a jar (a jar with a derived spendable
 * balance = `max(0, balance)`), or the virtual "Chưa phân bổ" pool (the CASA
 * money no jar claims — a no-jar transfer debits the account and lets the derived
 * pool shrink).
 */
export type TransferSource = { kind: "account" | "jar"; id: string } | { kind: "pool" };

/**
 * Bước cuối của Chuyển tiền (sau khi đã có người nhận): chọn tài khoản/hũ
 * nguồn, nhập số tiền/nội dung. "Đặt lịch chuyển tiền" chỉ là UI hiển thị —
 * prototype này chưa có lịch chuyển tiền thật, không có logic đứng sau.
 */
export function TransferAmountStep({
  recipient,
  accounts,
  jars = [],
  pool = null,
  source,
  amount,
  memo,
  canContinue,
  onChangeRecipient,
  onSourceChange,
  onAmountChange,
  onMemoChange,
  onContinue,
}: {
  recipient: SelectedRecipient;
  accounts: Account[];
  /** A jar with a running balance is selectable as a source (its derived `spendable = max(0, balance)`); one with none (`balance == null`) stays view-only. */
  jars?: (Jar & {
    balance: number | null;
    spendable: number | null;
    /** Đã chi tháng này / hạn mức tháng (`null` = unknown / chưa đặt) — a small hint under the balance. */
    spent?: number | null;
    limit?: number | null;
  })[];
  /** The virtual "Chưa phân bổ" pool (null/omitted while jars are still loading — RT#14). */
  pool?: UnallocatedPoolResult | null;
  source: TransferSource | null;
  amount: string;
  memo: string;
  canContinue: boolean;
  onChangeRecipient: () => void;
  onSourceChange: (source: TransferSource) => void;
  onAmountChange: (amount: string) => void;
  onMemoChange: (memo: string) => void;
  onContinue: () => void;
}) {
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const sourceAccount = source?.kind === "account" ? accounts.find((account) => account.id === source.id) : undefined;
  const sourceJar = source?.kind === "jar" ? jars.find((jar) => jar.id === source.id) : undefined;
  const sourcePool = source?.kind === "pool";
  // Over-allocated → available is 0 (invariant #6: the true negative is not shown
  // as a spendable balance; the pool row carries the "Vượt phân bổ" badge). No
  // CASA account → "unknown": shown as "Chưa rõ", never a fabricated 0.
  const poolKnown = pool != null && pool.amount !== "unknown";
  const poolAvailable = pool && pool.amount !== "unknown" ? Math.max(0, pool.amount) : 0;
  const poolText = poolKnown ? formatVnd(poolAvailable) : "Chưa rõ";
  const recipientBank = findBankByName(recipient.bankName);
  const showRecipientBankName = Boolean(recipient.bankName) && recipient.bankName !== recipient.name;

  return (
    <div className="flex h-full flex-col gap-4 px-4 pb-6">
      <Card className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {recipientBank ? (
            <BankLogo bank={recipientBank} />
          ) : (
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ background: avatarColor(recipient.name) }}
            >
              {initialOf(recipient.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">Người nhận</p>
            <p className="truncate text-[15.5px] font-semibold text-text">{recipient.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {showRecipientBankName && <span>{recipient.bankName} · </span>}
              <span className="tabular-nums">{recipient.accountNumber}</span>
            </p>
          </div>
        </div>
        <button type="button" onClick={onChangeRecipient} className="shrink-0 text-sm font-semibold text-primary">
          Đổi
        </button>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-[13px] font-medium text-muted">Tài khoản nguồn</label>
          <button
            type="button"
            onClick={() => setSourceSheetOpen(true)}
            aria-label="Tài khoản nguồn"
            className="flex w-full items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5 py-3"
          >
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs text-muted">
                {sourceAccount
                  ? `${sourceAccount.accountNumber} · ${ACCOUNT_TYPE_LABEL[sourceAccount.type]}`
                  : sourceJar
                    ? `Hũ ${sourceJar.label} · Còn lại`
                    : sourcePool
                      ? `${POOL_SOURCE_LABEL} · Số dư khả dụng`
                      : "Chọn tài khoản"}
              </p>
              {sourceAccount && <p className="mt-0.5 text-lg font-bold tabular-nums text-text">{formatVnd(sourceAccount.balance)}</p>}
              {sourceJar && <p className="mt-0.5 text-lg font-bold tabular-nums text-text">{formatVnd(sourceJar.spendable ?? 0)}</p>}
              {sourcePool && <p className="mt-0.5 text-lg font-bold tabular-nums text-text">{poolText}</p>}
            </div>
            <ChevronDown size={16} className="shrink-0 text-muted" />
          </button>
        </div>

        <div>
          <label htmlFor="xfer-amount" className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted">
            Số tiền <Info size={13} className="text-muted" aria-hidden />
          </label>
          <div className="flex h-14 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5">
            <input
              id="xfer-amount"
              // State holds raw digits; only the display is grouped "1.000.000".
              value={groupThousands(amount)}
              onChange={(event) => onAmountChange(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Nhập số tiền"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
            <span className="shrink-0 text-sm font-medium text-muted">VND</span>
          </div>
        </div>

        <div>
          <label htmlFor="xfer-memo" className="mb-2 block text-[13px] font-medium text-muted">
            Nội dung
          </label>
          <input
            id="xfer-memo"
            value={memo}
            onChange={(event) => onMemoChange(event.target.value)}
            placeholder="Ví dụ: Hoàn tiền ăn trưa"
            className="h-14 w-full rounded-2xl border border-border bg-surface px-3.5 text-[15px] text-text outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-text">Đặt lịch chuyển tiền</span>
          <button
            type="button"
            role="switch"
            aria-checked={scheduled}
            aria-label="Đặt lịch chuyển tiền"
            onClick={() => setScheduled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${scheduled ? "bg-primary" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${scheduled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      </Card>

      <div className="mt-auto flex flex-col gap-1.5">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Tiếp tục
        </button>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <SourceBadge source="mock" />
        </div>
      </div>

      {sourceSheetOpen && (
        <Sheet title="Chọn tài khoản nguồn" onClose={() => setSourceSheetOpen(false)}>
          {pool && (
            <button
              type="button"
              disabled={!poolKnown}
              onClick={() => {
                onSourceChange({ kind: "pool" });
                setSourceSheetOpen(false);
              }}
              className="flex w-full items-center gap-3 border-b border-border px-1 py-3 text-left disabled:opacity-45"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
              >
                <Wallet size={16} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-text">{POOL_SOURCE_LABEL}</p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-text">{poolText}</p>
                {/* Spendable-lens subtitle — distinguishes this pool (CASA − Σ còn-lại-các-hũ)
                    from the Tổng quan "Chờ phân bổ" budget-headroom card (CASA − Σ hạn mức). */}
                <p className="mt-0.5 text-[11px] text-muted">số dư khả dụng ngoài hũ</p>
              </div>
              {pool.overAllocated && (
                <span className="shrink-0 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                  Vượt phân bổ
                </span>
              )}
            </button>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {accounts.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSourceChange({ kind: "account", id: account.id });
                    setSourceSheetOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-1 px-1 py-3 text-left"
                >
                  <span className="text-xs text-muted">
                    {account.accountNumber} · {ACCOUNT_TYPE_LABEL[account.type]}
                  </span>
                  <span className="text-base font-bold tabular-nums text-text">{formatVnd(account.balance)}</span>
                  {account.type === "current" && (
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-source-msb-soft px-2.5 py-1 text-xs font-medium text-source-msb">
                      Mặc định
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {jars.length > 0 && (
            <>
              <div className="my-2 border-t border-border" />
              <p className="px-1 pb-2 text-xs font-semibold text-muted">Hũ chi tiêu</p>
              <ul className="flex flex-col divide-y divide-border">
                {jars.map((jar) => {
                  const Icon = jarIcon(jar.icon);
                  const accent = jarAccent(jar);
                  const fundable = jar.balance != null;
                  const row = (
                    <>
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ background: accent }}
                      >
                        <Icon size={16} strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-text">{jar.label}</p>
                        {fundable ? (
                          // Source picker → the derived "còn lại" (= max(0, balance)),
                          // the SAME number the Tổng quan overview shows for this jar.
                          <Money
                            amount={jar.spendable}
                            unknownLabel="—"
                            className="mt-0.5 block text-base font-bold tabular-nums text-text"
                          />
                        ) : (
                          <p className="mt-0.5 text-xs text-muted">Chưa có số dư</p>
                        )}
                        <JarMonthUsage spent={jar.spent ?? null} limit={jar.limit ?? null} />
                      </div>
                    </>
                  );
                  return (
                    <li key={jar.id}>
                      {fundable ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSourceChange({ kind: "jar", id: jar.id });
                            setSourceSheetOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-1 py-3 text-left"
                        >
                          {row}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 px-1 py-3 opacity-60">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

/** "1000000" → "1.000.000" (vi-VN grouping). String-based, so no precision loss on long input. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * "Đã chi 2.187.000 đ / 4.800.000 đ" — this month's spend against the jar's monthly
 * limit, small and quiet under the balance. Turns red once spend passes the limit. A
 * jar with no limit shows only what was spent ("Chưa đặt hạn mức"); one with neither
 * spend nor limit shows nothing (never a fabricated 0 line).
 */
function JarMonthUsage({ spent, limit }: { spent: number | null; limit: number | null }) {
  if (spent === null || (limit === null && spent <= 0)) return null;
  const over = limit !== null && spent > limit;
  return (
    <p className={cn("mt-0.5 text-[11px] tabular-nums", over ? "text-negative" : "text-muted")}>
      Đã chi {formatVnd(spent)} {limit === null ? "· Chưa đặt hạn mức" : `/ ${formatVnd(limit)}`} tháng này
    </p>
  );
}
