import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Account } from "@/domain/models";
import { SourceBadge } from "@/components/primitives";
import { formatVnd } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL } from "./account-meta";

/** Một dòng tài khoản trong danh sách → mở chi tiết. Touch ≥44px, provenance đủ. */
export function AccountListItem({ account }: { account: Account }) {
  const title = ACCOUNT_TYPE_LABEL[account.type];

  return (
    <Link
      href={`/accounts/${account.id}`}
      className="flex min-h-[112px] items-center gap-3 border-b border-[#dfe5ee] py-5 last:border-b-0 transition-opacity active:opacity-70 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] leading-6 font-medium text-text">{title}</p>
        <p className="mt-1 text-[15px] leading-6 text-muted">{account.maskedNumber}</p>
        <p className="mt-2 text-[18px] font-semibold tabular-nums text-text">{formatVnd(account.balance).replace(" VND", "")} <span className="font-normal text-muted">VND</span></p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5">
          <SourceBadge source={account.source} />
        </div>
      </div>
      <ChevronRight size={20} className="shrink-0 text-muted" />
    </Link>
  );
}
