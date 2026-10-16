"use client";

import { useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";
import { monthPeriodFromKey } from "@/domain/engine";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Card, SectionHeader } from "@/components/primitives";
import { Empty, ErrorState, Loading } from "@/components/states";
import { PeriodPicker } from "@/components/common/PeriodPicker";
import { BudgetList } from "@/components/budget/BudgetList";
import { TxnRow } from "@/components/transactions/TxnRow";
import { CategoryEditor } from "@/components/transactions/CategoryEditor";
import { DEFAULT_FILTERS, TxnFilters, type TxnFilterState } from "@/components/transactions/TxnFilters";
import { useFinancials } from "@/state/useFinancials";
import { usePeriod } from "@/state/period";

export default function TransactionsPage() {
  const { loading, error, transactions, financials } = useFinancials();
  const { month } = usePeriod();
  const [filters, setFilters] = useState<TxnFilterState>(DEFAULT_FILTERS);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const period = monthPeriodFromKey(month);
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (t.postedAt < period.from || t.postedAt > period.to) return false;
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (filters.categoryId !== "all" && t.categoryId !== filters.categoryId) return false;
      if (q && !t.merchantName.toLowerCase().includes(q) && !t.merchantNormalizedName.includes(q)) return false;
      return true;
    });
  }, [transactions, filters, period.from, period.to]);

  return (
    <div>
      <ScreenHeader title="Giao dịch" subtitle="Xem, tìm và sửa danh mục" />

      <div className="mb-4 flex items-center justify-between">
        <PeriodPicker />
        <span className="text-xs text-muted">{rows.length} giao dịch</span>
      </div>

      {loading && <Loading />}
      {error && <ErrorState />}

      {!loading && !error && financials && (
        <>
          <section className="mb-6">
            <SectionHeader title="Ngân sách tháng" subtitle="Mức chi so với hạn mức" />
            <Card>
              {financials.budgetLines.length > 0 ? (
                <BudgetList lines={financials.budgetLines} />
              ) : (
                <Empty title="Chưa có ngân sách" description="Thiết lập hạn mức để theo dõi chi tiêu." />
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Danh sách giao dịch" />
            <div className="mb-3">
              <TxnFilters value={filters} onChange={setFilters} />
            </div>
            {rows.length > 0 ? (
              <Card className="divide-y divide-border p-2">
                {rows.map((t) => (
                  <TxnRow key={t.id} txn={t} onEdit={setEditing} />
                ))}
              </Card>
            ) : (
              <Empty title="Không có giao dịch" description="Thử đổi bộ lọc hoặc chọn tháng khác." />
            )}
          </section>
        </>
      )}

      {editing && <CategoryEditor txn={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
