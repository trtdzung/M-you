"use client";

/**
 * The three NON-READY states of the persona's category taxonomy, in one place so
 * every picker/filter tells the user the same thing (DRY) and none of them can
 * quietly render as "no categories".
 *
 * Why the order in `taxonomyState` matters (U10): a failed load leaves
 * `loaded === false` forever, so checking `loaded` first would show a spinner
 * that never resolves; checking `error` first surfaces the real reason and the
 * retry. And an EMPTY taxonomy is a claim about the USER ("bạn chưa có danh mục
 * nào"), never about the network — it is only ever returned once a load actually
 * succeeded (invariant #6: a failure is not an empty result).
 */

import { RotateCcw } from "lucide-react";

export type TaxonomyState = "loading" | "error" | "empty" | "ready";

/**
 * Classify the taxonomy for rendering. `optionCount` is the number of options the
 * CALLER would offer (already filtered — a jar-restricted picker can legitimately
 * be empty while the taxonomy itself is not), so each surface decides what
 * "empty" means for it.
 */
export function taxonomyState(
  taxonomy: { loaded: boolean; error: string | null },
  optionCount: number,
): TaxonomyState {
  if (taxonomy.error) return "error";
  if (!taxonomy.loaded) return "loading";
  return optionCount === 0 ? "empty" : "ready";
}

/**
 * Render the notice for a non-ready state. Returns `null` for `"ready"` so a
 * caller can write `{notice ?? <TheRealThing />}` without a second branch.
 */
export function CategoryTaxonomyNotice({
  state,
  error,
  retry,
  emptyLabel = "Chưa có danh mục nào.",
  className,
}: {
  state: TaxonomyState;
  /** The provider's Vietnamese message; only read in the `"error"` state. */
  error?: string | null;
  retry: () => void;
  emptyLabel?: string;
  className?: string;
}) {
  const base = className ?? "py-6 text-center text-sm";

  if (state === "loading") {
    return (
      <p role="status" aria-live="polite" className={`${base} text-muted`}>
        Đang tải danh mục…
      </p>
    );
  }

  if (state === "error") {
    return (
      <div role="alert" className={`${base} text-negative`}>
        <p>{error ?? "Không tải được danh mục. Vui lòng thử lại."}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <RotateCcw size={13} aria-hidden /> Thử lại
        </button>
      </div>
    );
  }

  if (state === "empty") {
    return <p className={`${base} text-muted`}>{emptyLabel}</p>;
  }

  return null;
}
