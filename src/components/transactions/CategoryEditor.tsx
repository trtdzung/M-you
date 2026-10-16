"use client";

import { Check, RotateCcw } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { CATEGORIES } from "@/domain/models";
import { useCorrections } from "@/state/corrections";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/primitives";

/** Bottom-sheet to re-categorize a transaction. Writes an in-session correction. */
export function CategoryEditor({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const { setCategory, reset } = useCorrections();
  const options = CATEGORIES.filter((c) => c.kind !== "transfer");

  function choose(categoryId: string) {
    setCategory(txn.id, categoryId);
    onClose();
  }

  return (
    <Sheet title="Sửa danh mục" description={txn.merchantName} onClose={onClose}>
        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
          {options.map((c) => {
            const active = c.id === txn.categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c.id)}
                className={cn(
                  "flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <RotateCcw size={14} />
            Khôi phục danh mục gốc
          </button>
        )}
    </Sheet>
  );
}
