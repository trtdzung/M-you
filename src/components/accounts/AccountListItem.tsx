import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Account } from "@/domain/models";
import { Money, SourceBadge } from "@/components/primitives";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ICON } from "./account-meta";

/** Một dòng tài khoản trong danh sách → mở chi tiết. Touch ≥44px, provenance đủ. */
export function AccountListItem({ account }: { account: Account }) {
  const Icon = ACCOUNT_TYPE_ICON[account.type];
  const title = account.tier ?? ACCOUNT_TYPE_LABEL[account.type];

  return (
    <Link
      href={`/accounts/${account.id}`}
      className="shadow-card flex min-h-[64px] items-center gap-3 rounded-[20px] bg-surface p-4 transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{title}</p>
        <p className="text-xs text-muted">{account.maskedNumber}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Money amount={account.balance} className="text-sm font-bold" />
        <div className="flex items-center gap-1.5">
          <SourceBadge source={account.source} />
        </div>
      </div>
      <ChevronRight size={20} className="shrink-0 text-muted" />
    </Link>
  );
}
