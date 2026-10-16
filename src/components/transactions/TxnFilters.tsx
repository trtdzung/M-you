"use client";

import { Search } from "lucide-react";
import type { TransactionStatus } from "@/domain/models";
import { CATEGORIES } from "@/domain/models";

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

export function TxnFilters({
  value,
  onChange,
}: {
  value: TxnFilterState;
  onChange: (next: TxnFilterState) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
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
          className="flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
          aria-label="Lọc theo danh mục"
          className="flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text outline-none"
        >
          <option value="all">Mọi danh mục</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
