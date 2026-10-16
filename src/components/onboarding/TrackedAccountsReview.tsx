"use client";

import { Landmark } from "lucide-react";
import type { Account, AccountType } from "@/domain/models";
import { Money } from "@/components/primitives";
import { useFinancials } from "@/state/useFinancials";

const TYPE_LABEL: Record<AccountType, string> = {
  current: "Thanh toán",
  savings: "Tiết kiệm",
  credit_card: "Thẻ tín dụng",
};

/**
 * Read-only review of the accounts the app will track, straight from the
 * provider (invariant #4 — never a fixture import). We DISPLAY provenance and
 * balance rather than store a tracked-account selection: no consumer reads such
 * a flag yet, so persisting one would be dead state (YAGNI). Covers loading /
 * empty / error so setup never dead-ends on missing accounts.
 */
export function TrackedAccountsReview() {
  const { raw, loading, error } = useFinancials();
  const accounts = raw?.accounts ?? [];

  if (loading) {
    return <p className="text-xs text-muted">Đang tải tài khoản…</p>;
  }
  if (error) {
    return <p className="text-xs text-muted">Chưa tải được tài khoản. Bạn vẫn có thể bắt đầu.</p>;
  }
  if (accounts.length === 0) {
    return <p className="text-xs text-muted">Chưa có tài khoản nào để theo dõi.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} />
      ))}
    </ul>
  );
}

function AccountRow({ account }: { account: Account }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface-muted p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-primary">
        <Landmark size={20} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">
          {account.institution} · {TYPE_LABEL[account.type]}
        </span>
        <span className="block text-xs text-muted">{account.maskedNumber}</span>
      </span>
      <Money amount={account.balance} className="shrink-0 text-sm font-semibold text-text" />
    </li>
  );
}
