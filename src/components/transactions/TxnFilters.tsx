"use client";

import { Search } from "lucide-react";
import type { StoredCategory, TransactionStatus } from "@/domain/models";
import { CategoryTaxonomyNotice, taxonomyState } from "@/components/common/CategoryTaxonomyNotice";
import { useCategories } from "@/state/categories";

export interface TxnFilterState {
  search: string;
  status: TransactionStatus | "all";
  categoryId: string | "all";
}

export const DEFAULT_FILTERS: TxnFilterState = { search: "", status: "all", categoryId: "all" };

const STATUS_OPTIONS: { value: TxnFilterState["status"]; label: string }[] = [
  { value: "all", label: "Mọi trạng thái" },
  { value: "posted", label: "Đã ghi nhận" },
  { value: "pending", label: "Đang chờ" },
  { value: "refunded", label: "Đã hoàn" },
  { value: "reversed", label: "Đã hủy" },
];

/**
 * Which categories the filter offers: the persona's ACTIVE ones, plus the one
 * currently selected even if it has since been archived. Dropping a selected
 * archived id would leave the control reading "Mọi danh mục" while the list below
 * is still filtered (or, worse, silently widen the list) — the filter must always
 * name what it is actually showing (invariant #5).
 */
function filterOptions(categories: StoredCategory[], selectedId: string): StoredCategory[] {
  return categories.filter((c) => !c.archived || c.id === selectedId);
}

export function TxnFilters({
  value,
  onChange,
}: {
  value: TxnFilterState;
  onChange: (next: TxnFilterState) => void;
}) {
  const { categories, loaded, error, retry } = useCategories();
  const options = filterOptions(categories, value.categoryId);
  const state = taxonomyState({ loaded, error }, options.length);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-primary/50">
        <Search size={16} className="text-muted" />
        <input
          type="search"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Tìm theo tên cửa hàng…"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
          aria-label="Tìm giao dịch"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as TxnFilterState["status"] })}
          aria-label="Lọc theo trạng thái"
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
          aria-label="Lọc theo danh mục"
          disabled={state === "loading" || state === "error"}
          className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
        >
          <option value="all">Mọi danh mục</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      {/* Never let a failed taxonomy load read as "this user has no categories" (U10). */}
      <CategoryTaxonomyNotice
        state={state}
        error={error}
        retry={retry}
        emptyLabel="Chưa có danh mục nào để lọc."
        className="text-xs"
      />
    </div>
  );
}
