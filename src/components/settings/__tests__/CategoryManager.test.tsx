import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { JarConfigProvider } from "@/state/jars";
import { CategoryTaxonomyProvider } from "@/state/categories";
import { FinancialsTestProviders } from "@/test-utils/financials-test-providers";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import { CategoryManager } from "../CategoryManager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { HuCategoryTab } from "../HuCategoryTab";

/**
 * Custom-category CRUD against the real provider stack (fetch boundary stubbed by
 * `vitest.setup.ts`), same idiom as `HuEditorSheet-category-picker.test.tsx`. The
 * seed is the "Cá nhân" template: the "food" hũ ("Ăn uống") owns `dining` +
 * `groceries`, and the persona's taxonomy is the 10 bundled expense presets.
 *
 * The invariants under test, not just the clicks:
 *  - a refused delete is never a dead end: the 409 swaps the same sheet to the
 *    hide offer, with the SERVER's count;
 *  - hiding moves nothing: the hũ keeps the category, so no displayed total
 *    changes (invariant #6);
 *  - presets stay locked and expose no destructive action (invariant #5).
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <CategoryTaxonomyProvider>
            <FinancialsTestProviders>{children}</FinancialsTestProviders>
          </CategoryTaxonomyProvider>
        </JarConfigProvider>
      </ManualTxnsProvider>
    </PersonaProvider>
  );
}

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** Route fetches through `handler` first; `null` falls back to the installed API stub. */
function interceptFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | null) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init) ?? real(input, init);
  });
}

const topDialog = async () => (await screen.findAllByRole("dialog")).at(-1) as HTMLElement;
const jarRowText = (label: string) => screen.getByText(label).closest("button")?.textContent ?? "";

async function openTab() {
  render(<HuCategoryTab />, { wrapper });
  await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());
}

async function openManager() {
  fireEvent.click(screen.getByText("Quản lý danh mục"));
  return topDialog();
}

/** Fill the create sheet and submit it. */
async function submitCreate(label: string) {
  const input = await screen.findByLabelText("Tên danh mục");
  fireEvent.change(input, { target: { value: label } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo danh mục" }));
}

/** Create from the manager (no hũ chosen → the category is "chưa xếp hũ"). */
async function createFromManager(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
  await submitCreate(label);
  fireEvent.click(await screen.findByRole("button", { name: "Xong" }));
}

/**
 * The jar editor no longer offers "＋ Thêm danh mục": create `label` from the manager,
 * assign it to the "Ăn uống" hũ with the row's hũ select, then reopen that hũ's editor.
 */
async function createIntoFoodJar(label: string) {
  const manager = await openManager();
  await createFromManager(label);
  fireEvent.change(await screen.findByLabelText(`Hũ của ${label}`), { target: { value: "food" } });
  await waitFor(() => expect((screen.getByLabelText(`Hũ của ${label}`) as HTMLSelectElement).value).toBe("food"));
  fireEvent.click(within(manager).getByLabelText("Đóng"));
  fireEvent.click(screen.getByText("Ăn uống"));
  return topDialog();
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CategoryManager — the two sections (invariant #5: user data is not bank data)", () => {
  it("gives a custom row rename/hide/delete and a preset row a lock and nothing else", async () => {
    await openTab();
    await openManager();
    await createFromManager("Học phí");

    expect(await screen.findByLabelText("Tên danh mục Học phí")).toBeInTheDocument();
    expect(screen.getByLabelText("Ẩn danh mục Học phí")).toBeInTheDocument();
    expect(screen.getByLabelText("Xoá danh mục Học phí")).toBeInTheDocument();

    // The preset: a lock, a hũ select, and no way to rename, hide or delete it.
    expect(screen.queryByLabelText("Tên danh mục Ăn uống")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ẩn danh mục Ăn uống")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Xoá danh mục Ăn uống")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Hũ của Ăn uống")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Danh mục mặc định (khoá)")).toHaveLength(10);
  });

  it("leaves a category created from the manager unassigned (Chưa xếp hũ) and under «Danh mục của bạn»", async () => {
    await openTab();
    await openManager();
    fireEvent.click(screen.getByRole("button", { name: "Thêm danh mục" }));
    await submitCreate("Học phí");

    expect(await screen.findByText(/Danh mục đang ở “Chưa xếp hũ”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));

    const mine = (await screen.findByRole("heading", { name: "Danh mục của bạn" })).closest("section");
    expect(mine).not.toBeNull();
    expect(within(mine as HTMLElement).getByLabelText("Tên danh mục Học phí")).toBeInTheDocument();
    expect((screen.getByLabelText("Hũ của Học phí") as HTMLSelectElement).value).toBe("");
  });
});

describe("CategoryManager — rename", () => {
  it("persists a rename", async () => {
    await openTab();
    await openManager();
    await createFromManager("Học phí");

    const input = (await screen.findByLabelText("Tên danh mục Học phí")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Học phí con" } });
    fireEvent.blur(input);

    expect(await screen.findByLabelText("Tên danh mục Học phí con")).toBeInTheDocument();
    expect(screen.getByLabelText("Hũ của Học phí con")).toBeInTheDocument();
  });

  it("snaps the field back to the stored name when the write is refused, and says why", async () => {
    await openTab();
    await openManager();
    await createFromManager("Học phí");
    const input = (await screen.findByLabelText("Tên danh mục Học phí")) as HTMLInputElement;

    interceptFetch((url, init) =>
      url.startsWith("/api/categories/") && init?.method === "PATCH"
        ? Promise.resolve(json({ error: "db" }, 500))
        : null,
    );
    fireEvent.change(input, { target: { value: "Học phí con" } });
    fireEvent.blur(input);

    await waitFor(() => expect(input.value).toBe("Học phí"));
    expect(await screen.findByText(/Không lưu được danh mục/)).toBeInTheDocument();
  });
});

describe("CategoryManager — delete", () => {
  it("removes an unused category and drops the owning hũ's category count by one", async () => {
    await openTab();
    const editor = await createIntoFoodJar("Học phí");
    await within(editor).findByRole("button", { name: /Học phí/ });
    fireEvent.click(within(editor).getByLabelText("Đóng"));
    await waitFor(() => expect(jarRowText("Ăn uống")).toMatch(/3 danh mục/));

    await openManager();
    fireEvent.click(await screen.findByLabelText("Xoá danh mục Học phí"));
    fireEvent.click(await screen.findByRole("button", { name: "Xoá danh mục" }));

    await waitFor(() => expect(screen.queryByLabelText("Tên danh mục Học phí")).not.toBeInTheDocument());
    fireEvent.click(within(await topDialog()).getByLabelText("Đóng"));
    await waitFor(() => expect(jarRowText("Ăn uống")).toMatch(/2 danh mục/));
  });

  it("offers hiding with the SERVER's count when the category is still in use, and hiding moves no total", async () => {
    await openTab();
    const editor = await createIntoFoodJar("Học phí");
    await within(editor).findByRole("button", { name: /Học phí/ });
    fireEvent.click(within(editor).getByLabelText("Đóng"));

    // One stored correction now points at it — exactly what the server counts.
    await fetch("/api/corrections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cif: "CIF_0001",
        changes: { "txn-1": { categoryId: "c_hoc-phi", origin: "user", status: "applied" } },
      }),
    });

    await openManager();
    fireEvent.click(await screen.findByLabelText("Xoá danh mục Học phí"));
    fireEvent.click(await screen.findByRole("button", { name: "Xoá danh mục" }));

    expect(await screen.findByText(/Đang dùng ở 1 giao dịch nên không xoá được/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn danh mục" }));

    // The row leaves "Danh mục của bạn" for the collapsed "Đã ẩn (1)" group.
    const hiddenToggle = await screen.findByRole("button", { name: /Đã ẩn \(1\)/ });
    expect(screen.queryByLabelText("Tên danh mục Học phí")).not.toBeInTheDocument();
    fireEvent.click(hiddenToggle);
    expect(await screen.findByText("Học phí")).toBeInTheDocument();

    // Gone from the picker, but the hũ still owns it — no displayed total moved.
    fireEvent.click(within(await topDialog()).getByLabelText("Đóng"));
    await waitFor(() => expect(jarRowText("Ăn uống")).toMatch(/3 danh mục/));
    fireEvent.click(screen.getByText("Ăn uống"));
    const reopened = await topDialog();
    expect(within(reopened).queryByRole("button", { name: /Học phí/ })).not.toBeInTheDocument();
  });

  it("restores a hidden category to the pickers with «Hiện lại»", async () => {
    await openTab();
    await openManager();
    await createFromManager("Học phí");
    fireEvent.click(await screen.findByLabelText("Ẩn danh mục Học phí"));

    fireEvent.click(await screen.findByRole("button", { name: /Đã ẩn \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Hiện lại/ }));

    expect(await screen.findByLabelText("Tên danh mục Học phí")).toBeInTheDocument();
    fireEvent.click(within(await topDialog()).getByLabelText("Đóng"));
    fireEvent.click(screen.getByText("Ăn uống"));
    const editor = await topDialog();
    expect(await within(editor).findByRole("button", { name: /Học phí/ })).toBeInTheDocument();
  });
});

/**
 * Loading / error / empty come off the STUBBED taxonomy: the real provider would
 * need a fault injected at the fetch boundary to reach them, and the point here
 * is what the manager RENDERS for each, not how the provider got there.
 */
describe("CategoryManager — loading, error and empty states", () => {
  function renderWith(rest: Record<string, unknown>) {
    return render(
      <PersonaProvider>
        <JarConfigProvider>
          <StubCategoryTaxonomy {...rest}>
            <CategoryManager onClose={() => {}} />
          </StubCategoryTaxonomy>
        </JarConfigProvider>
      </PersonaProvider>,
    );
  }

  it("renders a loading notice instead of an empty list", async () => {
    renderWith({ loaded: false });
    expect(await screen.findByRole("status")).toHaveTextContent("Đang tải danh mục…");
    expect(screen.queryByRole("heading", { name: "Danh mục mặc định" })).not.toBeInTheDocument();
  });

  it("renders the load error with a retry instead of «no categories»", async () => {
    const retry = vi.fn();
    renderWith({ error: "Không tải được danh mục. Vui lòng thử lại.", retry });
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được danh mục");
    fireEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(retry).toHaveBeenCalled();
  });

  it("says the user has created nothing yet while still listing the presets", async () => {
    renderWith({});
    expect(await screen.findByText("Bạn chưa tạo danh mục nào.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Danh mục mặc định" })).toBeInTheDocument();
    expect(screen.getByLabelText("Hũ của Ăn uống")).toBeInTheDocument();
  });
});

describe("CategoryManager — the «coming in a future release» copy is gone", () => {
  // Assembled at runtime so this file is not itself an occurrence of the phrase
  // it forbids.
  const FORBIDDEN = ["bản", "cập", "nhật", "tới"].join(" ");

  it("leaves no promise of a future release anywhere under src/ — the feature shipped", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|css|md)$/.test(entry.name) && readFileSync(full, "utf8").includes(FORBIDDEN)) {
          offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
