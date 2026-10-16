"use client";

import { useEffect, useMemo, useState } from "react";
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
  initialCategoryId,
}: {
  transactions: Transaction[];
  month: string;
  loading: boolean;
  accountId?: string;
  /** Seed the category filter (drill-in from Dòng tiền, red-team #3). */
  initialCategoryId?: string;
}) {
  const [filters, setFilters] = useState<TxnFilterState>(
    initialCategoryId
      ? { ...DEFAULT_FILTERS, categoryId: initialCategoryId }
      : DEFAULT_FILTERS,
  );
  const [editing, setEditing] = useState<Transaction | null>(null);
  const period = monthPeriodFromKey(month);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      categoryId: initialCategoryId ?? "all",
    }));
  }, [initialCategoryId]);

  const periodTransactions = useMemo(
    () => transactions.filter((t) => {
      if (accountId && t.accountId !== accountId) return false;
      return t.postedAt >= period.from && t.postedAt <= period.to;
    }),
    [transactions, period.from, period.to, accountId],
  );

  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return periodTransactions.filter((t) => {
      if (filters.status !== "all" && t.status !== filters.status) return false;
      if (filters.categoryId !== "all" && t.categoryId !== filters.categoryId) return false;
      if (q && !t.merchantName.toLowerCase().includes(q) && !t.merchantNormalizedName.includes(q)) return false;
      return true;
    });
  }, [periodTransactions, filters]);

  const hasActiveFilters = Boolean(filters.search) || filters.status !== "all" || filters.categoryId !== "all";

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
      ) : periodTransactions.length === 0 ? (
        <Empty title="Chưa có dữ liệu cho kỳ này" description="Kỳ này chưa có giao dịch trong phạm vi đang xem." />
      ) : (
        <Empty
          title="Không có kết quả"
          description="Không có giao dịch khớp với bộ lọc hiện tại."
          action={hasActiveFilters ? (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-text transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Xóa bộ lọc
            </button>
          ) : undefined}
        />
      )}
      {editing && <CategoryEditor txn={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
