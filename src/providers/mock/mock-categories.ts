/**
 * The five category methods of `Providers`, over `/api/categories*`. Split out of
 * `mock-provider.ts` purely for size; it is the SOLE caller of those endpoints —
 * no UI or domain code fetches the taxonomy directly (invariant #4), which is
 * what keeps tenant scoping (`cif`) server-enforced.
 *
 * Mirrors the jar methods exactly: every non-ok response REJECTS with an
 * `ApiError` carrying the server's reason. A failed load is never disguised as an
 * empty taxonomy — "this persona has no categories" is a very different statement
 * from "we could not read them" (invariant #6), and only the first one may put an
 * empty picker on screen.
 */

import type { CategoryWriteResult, Providers } from "../interfaces";
import { apiError } from "../api-error";

type CategoryMethods = Pick<
  Providers,
  "getCategories" | "createCategory" | "updateCategory" | "archiveCategory" | "deleteCategory"
>;

export function createCategoryApi(cif: string): CategoryMethods {
  /** PATCH one category; both mutators below differ only in the patch body. */
  async function patchCategory(
    op: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<CategoryWriteResult> {
    const res = await fetch(`/api/categories/${encodeURIComponent(id)}?cif=${encodeURIComponent(cif)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    });
    if (!res.ok) throw await apiError(op, res);
    return res.json();
  }

  return {
    async getCategories(opts) {
      const params = new URLSearchParams({ cif });
      if (opts?.includeArchived) params.set("includeArchived", "1");
      const res = await fetch(`/api/categories?${params.toString()}`);
      if (!res.ok) throw await apiError("getCategories", res);
      return res.json();
    },
    async createCategory(input) {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cif, ...input }),
      });
      if (!res.ok) throw await apiError("createCategory", res);
      return res.json();
    },
    updateCategory(id, patch) {
      // Unlike a jar's `budgetLimit`, none of a category's fields has a "clear"
      // state, so an absent key stays absent rather than being sent as `null`
      // (the route REJECTS a non-string label / non-boolean flag outright).
      return patchCategory("updateCategory", id, { ...patch });
    },
    archiveCategory(id, archived) {
      return patchCategory("archiveCategory", id, { archived });
    },
    async deleteCategory(id) {
      const res = await fetch(`/api/categories/${encodeURIComponent(id)}?cif=${encodeURIComponent(cif)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await apiError("deleteCategory", res);
      return res.json();
    },
  };
}
