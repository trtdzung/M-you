"use client";

import { useMemo, useState } from "react";
import type { Transaction } from "@/domain/models";
import { monthPeriodFromKey } from "@/domain/engine";
import { Card } from "@/components/primitives";
import { Empty, SkeletonRow, SkeletonScreen } from "@/components/states";
import { TxnRow } from "./TxnRow";
import { CategoryEditor } from "./CategoryEditor";
import { DEFAULT_FILTERS, TxnFilters, type TxnFilterState } from "./TxnFilters";

/**
 * Danh sách giao dịch dùng chung (DRY) — tái dùng ở `/transactions` (tổng hợp mọi
 * TK) và `/accounts/[id]` (lọc theo 1 TK). Quản lý filter + CategoryEditor nội bộ.
 * Loại trừ theo period + account tuân theo bất biến (pending tách posted qua badge
 * ở TxnRow; không mặc định giá trị thiếu = 0).
 */
export function TransactionListSection({
  transactions,
  month,
  loading,
  accountId,
}: {
  transactions: Transaction[];
  month: string;
  loading: boolean;
  accountId?: string;
}) {
  const [filters, setFilters] = useState<TxnFilterState>(DEFAULT_FILTERS);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const period = monthPeriodFromKey(month);

  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (accountId && t.accountId !== accountId) return false;
      if (t.postedAt < period.from || t.postedAt > period.to) return false;
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (filters.categoryId !== "all" && t.categoryId !== filters.categoryId) return false;
      if (q && !t.merchantName.toLowerCase().includes(q) && !t.merchantNormalizedName.includes(q)) return false;
      return true;
    });
  }, [transactions, filters, period.from, period.to, accountId]);

  if (loading) {
    return (
      <SkeletonScreen>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </SkeletonScreen>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <TxnFilters value={filters} onChange={setFilters} />
      </div>
      {rows.length > 0 ? (
        <Card className="divide-y divide-border">
          {rows.map((t) => (
            <TxnRow key={t.id} txn={t} onEdit={setEditing} />
          ))}
        </Card>
      ) : (
        <Empty title="Không có giao dịch" description="Thử đổi bộ lọc hoặc chọn tháng khác." />
      )}
      {editing && <CategoryEditor txn={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
