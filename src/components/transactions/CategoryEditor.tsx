"use client";

import { RotateCcw } from "lucide-react";
import type { Transaction } from "@/domain/models";
import { useCorrections } from "@/state/corrections";
import { Sheet } from "@/components/primitives";
import { CategoryOptionGrid } from "./CategoryPickerSheet";

/** Bottom-sheet to re-categorize a transaction. Writes an in-session correction. */
export function CategoryEditor({ txn, onClose }: { txn: Transaction; onClose: () => void }) {
  const { setCategory, clearCategory } = useCorrections();

  function choose(categoryId: string) {
    setCategory(txn.id, categoryId);
    onClose();
  }

  return (
    <Sheet title="Sửa danh mục" description={txn.merchantName} onClose={onClose}>
      <CategoryOptionGrid selectedId={txn.categoryId} kind="all" onSelect={choose} />

      {txn.userEdited && (
        <button
          type="button"
          onClick={() => {
            clearCategory(txn.id);
            onClose();
          }}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-row border border-border py-2 text-sm text-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <RotateCcw size={14} />
          Khôi phục danh mục gốc
        </button>
      )}
    </Sheet>
  );
}
