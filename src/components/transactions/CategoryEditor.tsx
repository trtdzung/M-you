"use client";

import { Check, RotateCcw, X } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { CATEGORIES } from "@/domain/models";
import { useCorrections } from "@/state/corrections";
import { cn } from "@/lib/cn";

/** Bottom-sheet to re-categorize a transaction. Writes an in-session correction. */
export function CategoryEditor({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const { setCategory, reset } = useCorrections();
  const options = CATEGORIES.filter((c) => c.kind !== "transfer");

  function choose(categoryId: string) {
    setCategory(txn.id, categoryId);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Sửa danh mục">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-phone rounded-t-2xl bg-surface p-4 pb-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-text">Sửa danh mục</p>
            <p className="text-xs text-muted">{txn.merchantName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-surface-muted">
            <X size={18} />
          </button>
        </div>

        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
          {options.map((c) => {
            const active = c.id === txn.categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c.id)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                  active ? "border-primary bg-primary/10 font-medium text-text" : "border-border bg-surface text-text hover:bg-surface-muted",
                )}
              >
                <span className="truncate">{c.label}</span>
                {active && <Check size={15} className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        {txn.userEdited && (
          <button
            type="button"
            onClick={() => {
              reset(txn.id);
              onClose();
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm text-muted hover:bg-surface-muted"
          >
            <RotateCcw size={14} />
            Khôi phục danh mục gốc
          </button>
        )}
      </div>
    </div>
  );
}
