"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { SectionHeader } from "@/components/primitives";
import { ErrorState } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { TransactionListSection } from "@/components/transactions/TransactionListSection";
import { CATEGORY_BY_ID } from "@/domain/models";
import { useFinancials } from "@/state/useFinancials";
import { usePeriod } from "@/state/period";
import { availableMonths } from "@/lib/demo-clock";

/**
 * Giao dịch tổng hợp mọi tài khoản (Red Team #10 — view giữ nguyên, KHÔNG
 * redirect). Ngân sách đã chuyển sang PFM hub (Dòng tiền). Thuộc tab Tài khoản.
 * Drill-in từ Dòng tiền: `?category=<id>` seed sẵn bộ lọc danh mục — chỉ nhận id
 * hợp lệ trong `CATEGORY_BY_ID` (red-team #3), id lạ bị bỏ qua (không injection).
 */
export default function TransactionsPage() {
  const { loading, error, transactions } = useFinancials();
  const { month, setMonth } = usePeriod();
  const params = useSearchParams();
  const monthParam = params?.get("month");
  const requestedMonth = monthParam && availableMonths().some((option) => option.key === monthParam) ? monthParam : null;
  const categoryParam = params?.get("category");
  const initialCategoryId =
    categoryParam && CATEGORY_BY_ID[categoryParam] ? categoryParam : undefined;

  useEffect(() => {
    if (requestedMonth) setMonth(requestedMonth);
  }, [requestedMonth, setMonth]);

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
          <TransactionListSection
            transactions={transactions}
            month={month}
            loading={loading}
            initialCategoryId={initialCategoryId}
          />
        </section>
      )}
    </div>
  );
}
