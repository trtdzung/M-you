"use client";

import Link from "next/link";
import { ArrowLeftRight, Wallet } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { SectionHeader, Money } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { AccountListItem } from "@/components/accounts/AccountListItem";
import { useFinancials } from "@/state/useFinancials";

/** Tab Tài khoản: danh sách tài khoản + lối tắt tới giao dịch tổng hợp. */
export default function AccountsPage() {
  const { loading, error, raw } = useFinancials();
  const accounts = raw?.accounts ?? [];
  const depositAccounts = accounts.filter((a) => a.type !== "credit_card");
  const totalBalance = depositAccounts.every((a) => Number.isFinite(a.balance))
    ? depositAccounts.reduce((sum, a) => sum + a.balance, 0)
    : null;

  return (
    <div>
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
            <div className="overflow-hidden rounded-[24px] bg-white text-text">
              <div className="flex items-center gap-3 border-b border-[#dfe5ee] px-5 py-5">
                <Wallet size={24} strokeWidth={1.8} />
                <h2 className="text-xl font-bold">Tài khoản</h2>
              </div>
              {depositAccounts.length > 0 && (
                <div className="border-b border-[#dfe5ee] px-5 py-5">
                  <p className="text-base text-muted">Tổng số dư tài khoản</p>
                  <Money amount={totalBalance} className="mt-2 block text-[28px] font-bold" />
                </div>
              )}
              <div className="px-5">
                {accounts.map((a) => (
                  <AccountListItem key={a.id} account={a} />
                ))}
              </div>
            </div>
          ) : (
            <Empty title="Chưa có tài khoản" description="Chưa có tài khoản nào để hiển thị." />
          )}

          <section className="mt-6">
            <SectionHeader title="Giao dịch" subtitle="Xem tất cả tài khoản" />
            <Link
              href="/transactions"
              className="flex min-h-[56px] items-center gap-3 rounded-[24px] bg-white p-4 transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <ArrowLeftRight size={20} strokeWidth={1.8} />
              </span>
              <span className="text-sm font-semibold text-text">Tất cả giao dịch</span>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
