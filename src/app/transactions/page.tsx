"use client";

import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { SectionHeader } from "@/components/primitives";
import { ErrorState } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { TransactionListSection } from "@/components/transactions/TransactionListSection";
import { useFinancials } from "@/state/useFinancials";
import { usePeriod } from "@/state/period";

/**
 * Giao dịch tổng hợp mọi tài khoản (Red Team #10 — view giữ nguyên, KHÔNG
 * redirect). Ngân sách đã chuyển sang PFM hub (Dòng tiền). Thuộc tab Tài khoản.
 */
export default function TransactionsPage() {
  const { loading, error, transactions } = useFinancials();
  const { month } = usePeriod();

  return (
    <div>
      <ScreenHeader title="Giao dịch" subtitle="Tất cả tài khoản · xem, tìm và sửa danh mục" />

      <div className="mb-4">
        <PeriodPicker />
      </div>

      {error ? (
        <ErrorState />
      ) : (
        <section>
          <SectionHeader title="Danh sách giao dịch" />
          <TransactionListSection transactions={transactions} month={month} loading={loading} />
        </section>
      )}
    </div>
  );
}
