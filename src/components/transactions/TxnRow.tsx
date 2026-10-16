"use client";

import { Pencil } from "lucide-react";
import type { Transaction, TransactionStatus } from "@/domain/models";
import { categoryLabel } from "@/domain/models";
import type { Correction } from "@/state/corrections";
import { Money, SourceBadge } from "@/components/primitives";
import { formatRelativeDate } from "@/lib/format";
import { DEMO_NOW } from "@/lib/demo-clock";
import { cn } from "@/lib/cn";
import { CategoryProvenanceBadge } from "./CategoryProvenanceBadge";

const STATUS_META: Record<TransactionStatus, { label: string; className: string }> = {
  posted: { label: "Đã ghi nhận", className: "bg-surface-muted text-muted" },
  pending: { label: "Đang chờ", className: "bg-warning-soft text-warning" },
  refunded: { label: "Đã hoàn", className: "bg-positive-soft text-positive" },
  reversed: { label: "Đã hủy", className: "bg-negative-soft text-negative" },
};

/** One transaction row. Tapping opens the category editor. */
export function TxnRow({ txn, onEdit, correction }: { txn: Transaction; onEdit: (t: Transaction) => void; correction?: Correction }) {
  const category = categoryLabel(txn.categoryId);
  const status = STATUS_META[txn.status];
  const isCredit = txn.direction === "credit";

  return (
    <button
      type="button"
      onClick={() => onEdit(txn)}
      className="flex min-h-16 w-full items-center gap-3 rounded-row px-1 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{txn.merchantName}</span>
          {txn.userEdited && <Pencil size={11} className="shrink-0 text-primary" aria-label="Đã sửa danh mục" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>{category}</span>
          {correction?.status !== "pending" && <CategoryProvenanceBadge correction={correction} />}
          <span aria-hidden>·</span>
          <span>{formatRelativeDate(txn.postedAt, DEMO_NOW)}</span>
          <SourceBadge source={txn.source} />
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", status.className)}>{status.label}</span>
        </div>
      </div>
      <Money
        amount={txn.amount}
        sign={isCredit ? "credit" : "debit"}
        className={cn("shrink-0 text-sm font-semibold", txn.status === "reversed" && "line-through opacity-60")}
      />
    </button>
  );
}
