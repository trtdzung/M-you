"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, SkeletonCard, SkeletonScreen } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { AccountDetailHeader } from "@/components/accounts/AccountDetailHeader";
import { TransactionListSection } from "@/components/transactions/TransactionListSection";
import { useFinancials } from "@/state/useFinancials";
import { usePeriod } from "@/state/period";

/** Chi tiết 1 tài khoản: header + giao dịch lọc theo account (tái dùng list dùng chung). */
export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { loading, error, raw, transactions } = useFinancials();
  const { month } = usePeriod();
  const account = raw?.accounts.find((a) => a.id === id) ?? null;

  return (
    <div>
      <Link
        href="/accounts"
        className="mb-2 inline-flex items-center gap-1 pt-2 text-sm font-medium text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ChevronLeft size={18} /> Tài khoản
      </Link>

      {loading && (
        <SkeletonScreen>
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-24" />
        </SkeletonScreen>
      )}
      {error && <ErrorState />}

      {!loading && !error && (
        account ? (
          <div className="flex flex-col gap-4">
            <AccountDetailHeader account={account} />
            <section>
              <div className="mb-3 flex items-center justify-between">
                <SectionHeader title="Giao dịch" />
                <PeriodPicker />
              </div>
              <TransactionListSection
                transactions={transactions}
                month={month}
                loading={false}
                accountId={id}
              />
            </section>
          </div>
        ) : (
          <Empty title="Không tìm thấy tài khoản" description="Tài khoản không tồn tại hoặc đã bị xóa." />
        )
      )}
    </div>
  );
}
