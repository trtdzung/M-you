"use client";

import { useState } from "react";
import { EyeOff, Pencil, RotateCcw } from "lucide-react";
import type { Transaction, TransactionType } from "@/domain/models";
import { CATEGORY_BY_ID } from "@/domain/models";
import { Money, Sheet, SourceBadge } from "@/components/primitives";
import { useCorrections } from "@/state/corrections";
import { categoryColor } from "@/lib/category-colors";
import { cn } from "@/lib/cn";
import { CategoryOptionGrid } from "./CategoryPickerSheet";

const TYPE_LABEL: Record<TransactionType, string> = {
  income: "Thu nhập",
  expense: "Chi tiêu",
  transfer: "Chuyển khoản",
  refund: "Hoàn tiền",
  fee: "Phí",
  card_payment: "Thanh toán thẻ",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
}

/**
 * Chi tiết giao dịch: số tiền + provenance, gán 1 danh mục (hũ tự theo — exactly
 * one), và toggle "ẩn khỏi báo cáo". Ẩn/đổi danh mục đi qua corrections seam —
 * KHÔNG mutate provider Transaction (invariant #4). Chỉ trình bày + ghi override.
 */
export function TxnDetail({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const { corrections, setCategory, clearCategory, setHidden } = useCorrections();
  const [picking, setPicking] = useState(false);
  const hidden = corrections[txn.id]?.hidden === true;
  const category = CATEGORY_BY_ID[txn.categoryId];

  return (
    <Sheet title="Chi tiết giao dịch" description={txn.merchantName} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={txn.source} />
            <span className="text-xs text-muted">{TYPE_LABEL[txn.type]}</span>
          </div>
          <Money
            amount={txn.amount}
            sign={txn.direction === "credit" ? "credit" : "debit"}
            className={cn("text-lg font-bold", txn.status === "reversed" && "line-through opacity-60")}
          />
        </div>

        <dl className="flex flex-col divide-y divide-border rounded-2xl bg-surface-muted px-4">
          <Row label="Ngày" value={formatDate(txn.postedAt)} />
          <Row label="Trạng thái" value={txn.status === "posted" ? "Đã ghi nhận" : txn.status} />
          {txn.relatedTransactionId && <Row label="Tham chiếu" value={txn.relatedTransactionId} />}
        </dl>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Danh mục</span>
            {txn.userEdited && (
              <button
                type="button"
                onClick={() => clearCategory(txn.id)}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <RotateCcw size={12} aria-hidden /> Khôi phục gốc
              </button>
            )}
          </div>
          {picking ? (
            <CategoryOptionGrid
              selectedId={txn.categoryId}
              kind="all"
              onSelect={(id) => {
                setCategory(txn.id, id);
                setPicking(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(txn.categoryId) }} />
              <span className="flex-1 truncate text-left">{category?.label ?? txn.categoryId}</span>
              <Pencil size={13} className="shrink-0 text-primary" aria-hidden />
              <span className="text-xs text-primary">Đổi</span>
            </button>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3">
          <span className="flex items-center gap-2">
            <EyeOff size={16} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">Ẩn khỏi báo cáo</span>
              <span className="block text-xs text-muted">Không tính vào đã tiêu &amp; hạn mức hũ; vẫn tra cứu được.</span>
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={hidden}
            onChange={(e) => setHidden(txn.id, e.target.checked)}
            className="h-5 w-5 shrink-0 accent-primary"
            aria-label="Ẩn khỏi báo cáo"
          />
        </label>
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text">{value}</dd>
    </div>
  );
}
