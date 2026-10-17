import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { JarConfigProvider } from "@/state/jars";
import { CategoryTaxonomyProvider } from "@/state/categories";
import { CATEGORIES } from "@/domain/models";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { categoryColor } from "@/lib/category-colors";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { HuCategoryTab } from "../HuCategoryTab";

/**
 * `Danh mục trong hũ (n/total)` — the total is now the persona's own assignable
 * count, not a bundled constant. CIF_0001's taxonomy is seeded from the presets
 * and untouched by these tests, so the expected total is the preset expense count.
 */
const EXPENSE_COUNT = CATEGORIES.filter((c) => c.kind === "expense").length;
const countLabel = (n: number) => `Danh mục trong hũ (${n}/${EXPENSE_COUNT})`;

/**
 * Wiring of `HuCategoryPicker` into `HuEditorSheet` against the real provider
 * stack (fetch boundary stubbed by `vitest.setup.ts`'s `installMockJarsApi`,
 * same idiom as `settings-hu-edge.test.tsx`). The seed ("Cá nhân" template)
 * has a "food" jar ("Ăn uống") owning `dining` ("Ăn uống") + `groceries`
 * ("Nhu yếu phẩm"); `housing` ("Nhà ở") belongs to the "essentials" jar
 * ("Thiết yếu").
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <CategoryTaxonomyProvider>{children}</CategoryTaxonomyProvider>
        </JarConfigProvider>
      </ManualTxnsProvider>
    </PersonaProvider>
  );
}

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
// Single write door (plan 260920-1019): add AND remove both go through
// PATCH /api/jars/:id with the jar's full desired categoryIds — there is no
// separate POST /categories door any more.
const isJarPatch = (url: string, init?: RequestInit) =>
  /^\/api\/jars\/[^/]+\?/.test(url) && init?.method === "PATCH";

/** Route fetches through `handler` first; `null` falls back to the installed API stub. */
function interceptFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | null) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init) ?? real(input, init);
  });
}

/** Record every call matching `pred` (url + raw body) without altering the response. */
function captureCalls(pred: (url: string, init?: RequestInit) => boolean) {
  const calls: { url: string; body: string }[] = [];
  interceptFetch((url, init) => {
    if (pred(url, init)) calls.push({ url, body: String(init?.body) });
    return null;
  });
  return calls;
}

async function openEditor(label = "Ăn uống") {
  render(<HuCategoryTab />, { wrapper });
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  fireEvent.click(screen.getByText(label));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("HuEditorSheet — HuCategoryPicker: adding a category", () => {
  it("checking a category owned by another jar PATCHes /api/jars/food with it appended, and flips it to checked", async () => {
    const calls = captureCalls(isJarPatch);
    const dialog = await openEditor("Ăn uống");

    const row = await within(dialog).findByRole("button", { name: /Nhà ở/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(within(row).getByText("đang ở Thiết yếu")).toBeInTheDocument();

    fireEvent.click(row);

    await waitFor(() => expect(row).toHaveAttribute("aria-pressed", "true"));
    expect(within(row).queryByText(/đang ở/)).not.toBeInTheDocument();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/^\/api\/jars\/food\?cif=/);
    const parsed = JSON.parse(calls[0].body);
    // "food" already owns dining + groceries; the tapped id is appended, not
    // replacing them — the server's stripCategories takes it off "essentials".
    expect(parsed.patch.categoryIds).toEqual(["dining", "groceries", "housing"]);
    // "housing" is appended after the existing ids — "dining" stays first, so
    // the accent is unaffected and `nextCategoryPatch` omits `color`.
    expect(parsed.patch).not.toHaveProperty("color");
  });
});

describe("HuEditorSheet — HuCategoryPicker: removing a category", () => {
  it("unchecking an owned category PATCHes categoryIds with it removed and the rest kept, pinning the accent in the SAME request", async () => {
    const calls = captureCalls(isJarPatch);
    const dialog = await openEditor("Ăn uống");

    // "dining"'s label is itself "Ăn uống" — no ownership suffix since it's owned here.
    const row = await within(dialog).findByRole("button", { name: "Ăn uống" });
    expect(row).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(row);

    await waitFor(() => expect(row).toHaveAttribute("aria-pressed", "false"));
    // Server heals the orphan into "Khác" — the client never sends a "Khác" target itself.
    expect(within(row).getByText("đang ở Khác")).toBeInTheDocument();

    expect(calls).toHaveLength(1);
    const parsed = JSON.parse(calls[0].body);
    expect(parsed.patch.categoryIds).toEqual(["groceries"]);
    // "food" has no explicit color and "dining" (removed) was its first
    // category — the new first ("groceries") has a different accent, so
    // `nextCategoryPatch` pins the PRE-toggle accent into this same PATCH
    // (no second request: `calls` above already asserts exactly one call).
    expect(parsed.patch.color).toBe(categoryColor("dining"));
  });

  it("shows the live count in the field header and updates it after a change", async () => {
    const dialog = await openEditor("Ăn uống");
    expect(await within(dialog).findByText(countLabel(2))).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Ăn uống" }));

    await waitFor(() => expect(within(dialog).getByText(countLabel(1))).toBeInTheDocument());
    expect(within(dialog).queryByText(countLabel(2))).not.toBeInTheDocument();
  });
});

describe("HuEditorSheet — HuCategoryPicker: refused writes stay visible (U20)", () => {
  it("surfaces a failed categoryIds PATCH via JarMutationErrorNotice and keeps the row checked", async () => {
    interceptFetch((url, init) => (isJarPatch(url, init) ? Promise.resolve(json({ error: "db" }, 500)) : null));
    const dialog = await openEditor("Ăn uống");

    const row = await within(dialog).findByRole("button", { name: "Ăn uống" });
    fireEvent.click(row);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Không lưu được/);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(await within(dialog).findByText(countLabel(2))).toBeInTheDocument();
  });
});
