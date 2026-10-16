"use client";

import { Check, Plus } from "lucide-react";
import type { CategoryKind } from "@/domain/models";
import { CATEGORIES } from "@/domain/models";
import { categoryColor } from "@/lib/category-colors";
import { cn } from "@/lib/cn";

/**
 * A select-one category grid — the shared primitive behind the transaction
 * category picker, the Add-transaction form, and (phase 06) the category manager.
 * Under exactly-one, a transaction's category also fixes its hũ, so picking one
 * here is all it takes. `onAddCategory` is an optional affordance wired in phase
 * 06 (create a new category, which forces a hũ choice); omitted, the "＋" hides.
 */
export function CategoryOptionGrid({
  selectedId,
  onSelect,
  kind = "expense",
  onAddCategory,
  allowedCategoryIds,
  uncategorizedOption,
}: {
  selectedId?: string;
  onSelect: (categoryId: string) => void;
  /** Which categories to offer. "all" shows income + expense (never transfers). */
  kind?: CategoryKind | "all";
  onAddCategory?: () => void;
  /**
   * Restrict the grid to exactly these category ids (used by the transfer
   * success card to keep a jar-sourced txn within its jar's categories). When
   * set, `kind` is ignored. An empty array renders an empty state.
   */
  allowedCategoryIds?: string[];
  /**
   * Extra neutral "opt-out" tile appended after the grid (e.g. "Không phân loại"
   * mapping back to the transfer category for an account-sourced transfer).
   */
  uncategorizedOption?: { id: string; label: string };
}) {
  const options = allowedCategoryIds
    ? CATEGORIES.filter((c) => allowedCategoryIds.includes(c.id))
    : CATEGORIES.filter((c) => (c.kind === "transfer" ? false : kind === "all" ? true : c.kind === kind));

  // Only the jar-restricted path can legitimately be empty (a jar with no
  // categories); other callers always have options and keep their affordances.
  if (allowedCategoryIds && options.length === 0 && !uncategorizedOption) {
    return <p className="py-6 text-center text-sm text-muted">Hũ chưa có danh mục</p>;
  }

  return (
    <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
      {options.map((c) => {
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-pressed={active}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-row border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              active ? "border-primary bg-primary/10 font-medium text-text" : "border-border bg-surface text-text hover:bg-surface-muted",
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(c.id) }} />
            <span className="flex-1 truncate text-left">{c.label}</span>
            {active && <Check size={15} className="shrink-0 text-primary" aria-hidden />}
          </button>
        );
      })}
      {uncategorizedOption && (
        <button
          key={uncategorizedOption.id}
          type="button"
          onClick={() => onSelect(uncategorizedOption.id)}
          aria-pressed={uncategorizedOption.id === selectedId}
          className={cn(
            "col-span-2 flex min-h-11 items-center gap-2 rounded-row border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            uncategorizedOption.id === selectedId
              ? "border-primary bg-primary/10 font-medium text-text"
              : "border-border bg-surface text-muted hover:bg-surface-muted",
          )}
        >
          <span className="flex-1 truncate text-left">{uncategorizedOption.label}</span>
          {uncategorizedOption.id === selectedId && <Check size={15} className="shrink-0 text-primary" aria-hidden />}
        </button>
      )}
      {onAddCategory && (
        <button
          type="button"
          onClick={onAddCategory}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-row border border-dashed border-border px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Plus size={15} aria-hidden /> Thêm danh mục
        </button>
      )}
    </div>
  );
}

