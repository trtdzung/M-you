"use client";

import Link from "next/link";
import { ArrowLeftRight, Wallet, PiggyBank, CreditCard, ChevronDown } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { formatVnd } from "@/lib/format";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { AccountListItem } from "@/components/accounts/AccountListItem";
import { useFinancials } from "@/state/useFinancials";

/** Tab Tài khoản: danh sách tài khoản + lối tắt tới giao dịch tổng hợp. */
export default function AccountsPage() {
  const { loading, error, raw } = useFinancials();
  const accounts = raw?.accounts ?? [];
  const depositAccounts = accounts.filter((a) => a.type === "current");
  const groups = [
    { title: "Tài khoản", Icon: Wallet, items: depositAccounts },
    { title: "Tiền gửi & Đầu tư", Icon: PiggyBank, items: accounts.filter((a) => a.type === "savings") },
    { title: "Thẻ tín dụng", Icon: CreditCard, items: accounts.filter((a) => a.type === "credit_card") },
  ];
  const totalBalance = depositAccounts.every((a) => Number.isFinite(a.balance))
    ? depositAccounts.reduce((sum, a) => sum + a.balance, 0)
    : null;

  return (
    <div className="accounts-overview">
      <ScreenHeader title="Tài sản" />

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-20" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && (
        <>
          {accounts.length > 0 ? (
            <div className="flex flex-col gap-6">
              {groups.filter((group) => group.items.length > 0).map(({ title, Icon, items }) => (
                <details open key={title} className="group overflow-hidden rounded-[18px] bg-white text-text">
                  <summary className="flex min-h-[58px] cursor-pointer list-none items-center gap-3 px-[17px] py-4 [&::-webkit-details-marker]:hidden">
                    <Icon size={22} strokeWidth={1.8} />
                    <h2 className="flex-1 text-[18px] font-semibold">{title}</h2>
                    <ChevronDown size={20} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-[#dfe5ee]">
                  {title === "Tài khoản" && (
                    <div className="border-b border-[#dfe5ee] px-[17px] py-5">
                      <p className="text-[15px] leading-6 text-muted">Tổng số dư</p>
                      <p className="mt-2 text-[22px] font-semibold tabular-nums">{formatVnd(totalBalance).replace(" VND", "")} {totalBalance !== null && <span className="font-normal text-muted">VND</span>}</p>
                    </div>
                  )}
                  <div className="px-[17px]">
                    {items.map((a) => <AccountListItem key={a.id} account={a} />)}
                  </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <Empty title="Chưa có tài khoản" description="Chưa có tài khoản nào để hiển thị." />
          )}

          <section className="mt-6">
            <Link
              href="/transactions"
              className="flex min-h-[56px] items-center gap-3 rounded-[24px] bg-white p-4 transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <ArrowLeftRight size={20} strokeWidth={1.8} />
              </span>
              <span className="text-base font-semibold text-text">Tất cả giao dịch</span>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
