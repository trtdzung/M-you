import type { ReactNode } from "react";
import { CATEGORIES, type StoredCategory } from "@/domain/models";
import { CategoryTaxonomyContext, type CategoryTaxonomyContextValue } from "@/state/categories";

/**
 * An already-loaded taxonomy, synchronously, for tests of PRESENTATIONAL
 * components that merely read `useCategories()` (a picker, a label, a filter).
 *
 * The real `CategoryTaxonomyProvider` fetches, so wrapping such a component in it
 * would turn every synchronous assertion into a `waitFor` without testing
 * anything more: the provider itself is covered by `state/__tests__/categories`
 * and by the route tests. Tests that exercise LOADING / ERROR / retry pass
 * `loaded: false` or an `error` here, or use the real provider.
 *
 * Defaults to the bundled presets — the same set a freshly seeded persona has —
 * so existing expectations about preset labels keep their meaning.
 */
export function StubCategoryTaxonomy({
  children,
  categories = CATEGORIES.map((c) => ({ ...c }) as StoredCategory),
  loaded = true,
  error = null,
  ...rest
}: {
  children: ReactNode;
  categories?: StoredCategory[];
  loaded?: boolean;
  error?: string | null;
} & Partial<CategoryTaxonomyContextValue>) {
  const value: CategoryTaxonomyContextValue = {
    categories,
    byId: new Map(categories.map((c) => [c.id, c])),
    assignable: categories.filter((c) => c.kind === "expense" && !c.archived),
    labels: new Map(categories.map((c) => [c.id, c.label])),
    loaded,
    error,
    retry: () => {},
    mutationError: null,
    mutationUsedBy: null,
    clearMutationError: () => {},
    addCategory: async () => false,
    renameCategory: async () => false,
    setArchived: async () => false,
    removeCategory: async () => false,
    ...rest,
  };
  return <CategoryTaxonomyContext.Provider value={value}>{children}</CategoryTaxonomyContext.Provider>;
}
