"use client";

import { Plus } from "lucide-react";

/**
 * The one "＋ Thêm danh mục" affordance, shared by every surface that offers
 * creating a category: the transaction grid (`CategoryOptionGrid`), the jar
 * editor's picker (`HuCategoryPicker`) and the category manager. One component so
 * the escape hatch looks and reads the same everywhere the user meets it.
 *
 * Deliberately rendered even when the taxonomy came back EMPTY or FAILED to load:
 * "chưa có danh mục nào" must never be a dead end.
 */
export function AddCategoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-row border border-dashed border-border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <Plus size={15} aria-hidden /> Thêm danh mục
    </button>
  );
}
