"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Account } from "@/domain/models";
import { Money, SourceBadge, Freshness } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ICON } from "./account-meta";

/** Header chi tiết tài khoản: loại/hạng, số TK mask, số dư lớn (mask+eye), nguồn. */
export function AccountDetailHeader({ account }: { account: Account }) {
  // Privacy-by-default: mask the balance on mount, matching the Home summary card.
  const [hidden, setHidden] = useState(true);
  const Icon = ACCOUNT_TYPE_ICON[account.type];
  const title = account.tier ?? ACCOUNT_TYPE_LABEL[account.type];
  const isCredit = account.type === "credit_card";

  return (
    <section className="shadow-card rounded-[24px] bg-surface p-5" aria-label="Chi tiết tài khoản">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-text">{title}</p>
          <p className="text-xs text-muted">{account.maskedNumber}</p>
        </div>
        <SourceBadge source={account.source} className="ml-auto" />
      </div>

      <div className="my-4 h-px bg-border" />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">
            {isCredit ? "Dư nợ hiện tại" : "Số dư"}
          </p>
          <p className="mt-1 text-2xl font-bold text-text">
            {hidden ? (
              <span aria-label="Số dư đang ẩn" aria-hidden="true">
                *******
              </span>
            ) : (
              <Money amount={account.balance} className="text-2xl font-bold" />
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? "Hiện số dư" : "Ẩn số dư"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {hidden ? <Eye size={22} /> : <EyeOff size={22} />}
        </button>
      </div>
      {account.type !== "credit_card" && (
        <p className="mt-1 text-xs text-muted">
          Khả dụng: {formatVnd(account.availableBalance)}
        </p>
      )}
      <div className="mt-2">
        <Freshness at={account.lastSyncedAt} className="text-[11px]" />
      </div>
    </section>
  );
}
