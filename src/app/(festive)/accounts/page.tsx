"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { AccountListItem } from "@/components/accounts/AccountListItem";
import { useFinancials } from "@/state/useFinancials";

/** Tab Tài khoản: danh sách tài khoản + lối tắt tới giao dịch tổng hợp. */
export default function AccountsPage() {
  const { loading, error, raw } = useFinancials();
  const accounts = raw?.accounts ?? [];

  return (
    <div>
      <ScreenHeader title="Tài khoản" />

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
            <div className="flex flex-col gap-3">
              {accounts.map((a) => (
                <AccountListItem key={a.id} account={a} />
              ))}
            </div>
          ) : (
            <Empty title="Chưa có tài khoản" description="Chưa có tài khoản nào để hiển thị." />
          )}

          <section className="mt-6">
            <SectionHeader title="Giao dịch" subtitle="Xem tất cả tài khoản" />
            <Link
              href="/transactions"
              className="shadow-card flex min-h-[56px] items-center gap-3 rounded-[20px] bg-surface p-4 transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
