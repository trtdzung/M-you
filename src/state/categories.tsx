"use client";

/**
 * The persona's category taxonomy — a thin client over `/api/categories*`
 * (SQLite-backed, per cif; see `data/schema.md`). Categories are DATA, not a
 * bundled constant (invariant #7): UI, filters and charts read them from here,
 * never from `CATEGORIES`, and never by fetching the endpoint themselves
 * (invariant #4 — the mock provider is the sole caller, so tenant scoping stays
 * server-enforced).
 *
 * Structured exactly like `jars.tsx` and sharing its machinery: ONE serial queue
 * so writes reach the server in click order (U13/K04), and a persona generation
 * guard (K03) that drops a response belonging to the previous persona.
 *
 * **Why it is mounted INSIDE `JarConfigProvider`.** A category write is also a jar
 * write — creating a category re-homes it into a hũ, deleting one strips it — so
 * every mutation answers with `{ categories, jarConfig }`. That config is handed
 * straight to `useJarConfig().applyServerConfig`, i.e. to the JAR provider's own
 * queue. Keeping a second copy of the jar config here is exactly how a category
 * ends up in two hũ client-side, and `evaluateJarBudget` would then double-count
 * its spend (Σ-conservation, invariant #6).
 *
 * Failures are surfaced, never swallowed (U10/U20): `error` for the initial load
 * (an empty taxonomy is a claim about the user, not about the network), and
 * `mutationError` (Vietnamese, server reason kept — e.g. "đang dùng ở 12 giao
 * dịch") for a refused write.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { StoredCategory } from "@/domain/models";
import type { CategoryWriteResult, Providers } from "@/providers";
import { useProviders } from "@/providers/context";
import { withKnownArchived } from "./categories-archived";
import { CATEGORY_LOAD_ERROR, categoryInUseCount, categoryMutationErrorMessage } from "./categories-error-message";
import { useJarConfig } from "./jars";
import { useSerialRequestQueue } from "./serial-request-queue";

export interface CategoryTaxonomyContextValue {
  /** Every stored category in display order, ARCHIVED ones included (flagged). */
  categories: StoredCategory[];
  /** Lookup over the same set — archived included, so a historical transaction's label still resolves (invariant #5). */
  byId: ReadonlyMap<string, StoredCategory>;
  /** The set a category may be PUT INTO a hũ from: active expense only. Pickers use this, never `categories`. */
  assignable: StoredCategory[];
  /** id → label for the whole set, for `categoryLabel(id, labels)` call sites. */
  labels: ReadonlyMap<string, string>;
  /** False until the first fetch for the current persona resolves — render a loading state, never an empty picker. */
  loaded: boolean;
  /** Non-null (VN copy) when the load for the current persona failed; reset on persona switch/retry. */
  error: string | null;
  /** Re-run the load for the current persona (clears `error`). */
  retry: () => void;
  /** VN reason of the latest failed write (403 built-in / 409 duplicate / 409 in-use); null once a write succeeds. */
  mutationError: string | null;
  /**
   * The server's own `usedBy` when the latest failed write was a delete refused
   * because the category is still in use; null for every other outcome. Kept as a
   * NUMBER next to the sentence so the delete sheet can offer "ẩn danh mục" with
   * the exact count instead of parsing it back out of the copy.
   */
  mutationUsedBy: number | null;
  clearMutationError: () => void;
  /** Mutators resolve `true` when the write was applied, `false` when it failed (see `mutationError`). */
  addCategory: (input: { label: string; fixed?: boolean; jarId?: string }) => Promise<boolean>;
  renameCategory: (id: string, label: string) => Promise<boolean>;
  /** Hide/un-hide: an archived category leaves the pickers but KEEPS its hũ, so no past total moves. */
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  /** Hard-delete an UNUSED custom category. In use → refused with its count (archive instead). */
  removeCategory: (id: string) => Promise<boolean>;
}

const EMPTY: StoredCategory[] = [];

/**
 * Exported for ONE reason: a presentational test can hand a component an
 * already-loaded taxonomy synchronously (`src/test-utils/category-taxonomy-stub.tsx`)
 * instead of driving the whole fetch stack for a picker that owns no data.
 * Application code must go through `CategoryTaxonomyProvider` / `useCategories`.
 */
export const CategoryTaxonomyContext = createContext<CategoryTaxonomyContextValue | null>(null);

export function CategoryTaxonomyProvider({ children }: { children: React.ReactNode }) {
  const providers = useProviders();
  const jars = useJarConfig();
  const [categories, setCategories] = useState<StoredCategory[]>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationUsedBy, setMutationUsedBy] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { enqueue, generation, newGeneration } = useSerialRequestQueue();
  // Held in a ref: the jar provider hands out a new context object on every config
  // change, and a mutator that changed identity with it would rebuild this whole
  // context (and every consumer) each time a hũ is edited.
  const jarsRef = useRef(jars);
  jarsRef.current = jars;

  // Load on mount, persona switch and retry. Reset FIRST, synchronously, so the
  // previous persona's categories never linger in a picker (H5).
  useEffect(() => {
    const gen = newGeneration();
    setCategories(EMPTY);
    setLoaded(false);
    setError(null);
    setMutationError(null);
    setMutationUsedBy(null);
    // `includeArchived`: hidden rows are excluded from `assignable` below, but
    // their labels are still needed to render old transactions honestly.
    enqueue(() => providers.getCategories({ includeArchived: true })).then(
      (next) => {
        if (gen !== generation()) return;
        setCategories(next);
        setLoaded(true);
      },
      (err: unknown) => {
        console.error("Failed to load categories", err);
        if (gen === generation()) setError(CATEGORY_LOAD_ERROR);
      },
    );
    return () => void newGeneration();
  }, [providers, reloadKey, enqueue, generation, newGeneration]);

  /** Run one taxonomy write in order; apply its response only for the live persona. */
  const mutate = useCallback(
    (op: (p: Providers) => Promise<CategoryWriteResult>, deletedId?: string): Promise<boolean> => {
      const gen = generation();
      // Which hũ set the server is about to answer from. Read immediately before
      // the request goes out, so a jar response landing in the meantime can be
      // recognised as the newer one (see `applyServerConfig`).
      let since = 0;
      return enqueue(() => {
        since = jarsRef.current.configToken();
        return op(providers);
      }).then(
        (res) => {
          if (gen !== generation()) return false; // K03: previous persona's response
          setCategories((prev) => withKnownArchived(prev, res.categories, deletedId));
          setMutationError(null);
          setMutationUsedBy(null);
          // The same write rewrote the hũ set: apply it through the JAR queue.
          void jarsRef.current.applyServerConfig(res.jarConfig, since);
          return true;
        },
        (err: unknown) => {
          console.error("Category mutation failed", err);
          if (gen === generation()) {
            setMutationError(categoryMutationErrorMessage(err));
            setMutationUsedBy(categoryInUseCount(err));
          }
          return false;
        },
      );
    },
    [enqueue, generation, providers],
  );

  const value = useMemo<CategoryTaxonomyContextValue>(
    () => ({
      categories,
      byId: new Map(categories.map((c) => [c.id, c])),
      assignable: categories.filter((c) => c.kind === "expense" && !c.archived),
      labels: new Map(categories.map((c) => [c.id, c.label])),
      loaded,
      error,
      retry: () => setReloadKey((k) => k + 1),
      mutationError,
      mutationUsedBy,
      clearMutationError: () => {
        setMutationError(null);
        setMutationUsedBy(null);
      },
      addCategory: (input) => mutate((p) => p.createCategory(input)),
      renameCategory: (id, label) => mutate((p) => p.updateCategory(id, { label })),
      setArchived: (id, archived) => mutate((p) => p.archiveCategory(id, archived)),
      removeCategory: (id) => mutate((p) => p.deleteCategory(id), id),
    }),
    [categories, loaded, error, mutationError, mutationUsedBy, mutate],
  );

  return <CategoryTaxonomyContext.Provider value={value}>{children}</CategoryTaxonomyContext.Provider>;
}

export function useCategories(): CategoryTaxonomyContextValue {
  const ctx = useContext(CategoryTaxonomyContext);
  if (!ctx) throw new Error("useCategories must be used within <CategoryTaxonomyProvider>");
  return ctx;
}

/**
 * The same value, or `null` when the taxonomy is not an ancestor. ONLY for the
 * handful of providers that sit ABOVE it in the tree (they cannot, since it needs
 * `useJarConfig()`), e.g. `category-memory.tsx`. A component must use
 * `useCategories()` and render the loading/error states instead.
 */
export function useOptionalCategories(): CategoryTaxonomyContextValue | null {
  return useContext(CategoryTaxonomyContext);
}
