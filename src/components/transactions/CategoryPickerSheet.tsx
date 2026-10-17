"use client";

import { Check } from "lucide-react";
import type { CategoryKind } from "@/domain/models";
import { AddCategoryButton } from "@/components/common/AddCategoryButton";
import { CategoryTaxonomyNotice, taxonomyState } from "@/components/common/CategoryTaxonomyNotice";
import { useCategories } from "@/state/categories";
import { categoryColor } from "@/lib/category-colors";
import { cn } from "@/lib/cn";

/**
 * A select-one category grid — the shared primitive behind the transaction
 * category picker and the Add-transaction form. Under exactly-one, a
 * transaction's category also fixes its hũ, so picking one here is all it takes.
 * `onAddCategory` opens `CategoryCreateSheet` with NO `jarId`: from a
 * transaction the user has not chosen a hũ, so the server heals the new category
 * into "Khác" and the sheet says so. Omitted, the "＋" hides — surfaces that
 * cannot own a create flow (the transfer categorize step) simply don't pass it.
 *
 * Options come from the PERSONA'S stored taxonomy (`useCategories()`), never from
 * the bundled constant: a category the user created must be offerable the moment
 * it exists, and one they archived must disappear from every picker while its
 * historical labels keep resolving. While the taxonomy is loading — or if its
 * load FAILED — this renders a state instead of a silently empty grid (U10): an
 * empty picker would read as "you have no categories", which is a claim about the
 * user, not about the network (invariant #6).
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
  const { categories, loaded, error, retry } = useCategories();

  // Archived is excluded on EVERY path, including the jar-restricted one: a hũ
  // keeps a hidden category (so its past spend stays put) but the user must not
  // be able to label a new transaction with it.
  const active = categories.filter((c) => !c.archived);
  const options = allowedCategoryIds
    ? active.filter((c) => allowedCategoryIds.includes(c.id))
    : active.filter((c) => (c.kind === "transfer" ? false : kind === "all" ? true : c.kind === kind));

  const state = taxonomyState({ loaded, error }, options.length);
  if (state !== "ready") {
    // The jar-restricted path can legitimately be empty (a hũ whose categories
    // are all archived); elsewhere an empty taxonomy is the user's own state. In
    // both cases the "＋ Thêm danh mục" escape hatch stays available.
    const emptyLabel = allowedCategoryIds ? "Hũ chưa có danh mục" : "Chưa có danh mục nào.";
    const notice = <CategoryTaxonomyNotice state={state} error={error} retry={retry} emptyLabel={emptyLabel} />;
    if (state !== "empty" || !uncategorizedOption) {
      return (
        <div>
          {notice}
          {state === "empty" && onAddCategory && <AddCategoryButton onClick={onAddCategory} />}
        </div>
      );
    }
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
      {onAddCategory && <AddCategoryButton onClick={onAddCategory} />}
    </div>
  );
}

