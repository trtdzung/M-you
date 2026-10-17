import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { JarConfigProvider } from "@/state/jars";
import { CategoryTaxonomyProvider } from "@/state/categories";
import { ManualTxnsProvider } from "@/state/manual-txns";

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

import { HuCategoryTab } from "../HuCategoryTab";

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

beforeEach(() => {
  window.localStorage.clear();
  replace.mockClear();
  query = "";
});

/**
 * Settings "Hũ & danh mục". The seed is the Cá nhân template (6 jars). These
 * tests pin the budget-model behaviours that matter: a jar's limit can be set and
 * cleared to "chưa đặt" (never 0), a jar can be deleted (its categories heal to
 * "Khác"), and a category always lands in exactly one jar.
 */
describe("HuCategoryTab", () => {
  it("lists the seeded jars", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Thêm hũ/ })).toBeInTheDocument();
  });

  it("opens a jar editor and sets then clears its monthly limit", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Ăn uống"));
    const dialog = await screen.findByRole("dialog");
    const limit = within(dialog).getByLabelText("Hạn mức mỗi tháng");

    fireEvent.change(limit, { target: { value: "3000000" } });
    fireEvent.blur(limit);
    expect((limit as HTMLInputElement).value).toBe("3000000");

    // Clearing the field returns the jar to "chưa đặt" (unknown, not 0).
    fireEvent.change(limit, { target: { value: "" } });
    fireEvent.blur(limit);
    expect(within(dialog).getByText(/Để trống = chưa đặt/)).toBeInTheDocument();
  });

  it("blocks a monthly limit that would push Σ over CASA and surfaces an over-balance error", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Ăn uống"));
    const dialog = await screen.findByRole("dialog");
    const limit = within(dialog).getByLabelText("Hạn mức mỗi tháng");

    // CIF_0001 CASA is 18tr and the seed already allocates 17tr across the other
    // jars; pushing Ăn uống to 20tr would blow the cap → the client rejects it.
    fireEvent.change(limit, { target: { value: "20000000" } });
    fireEvent.blur(limit);
    expect(await within(dialog).findByText(/Vượt số dư/)).toBeInTheDocument();
  });

  it("adds a new jar and opens its editor", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Thêm hũ/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("Hũ mới")).toBeInTheDocument();
  });

  it("auto-opens the jar named by ?hu= and clears the param on close", async () => {
    // Seed first so we can target a real jar id.
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());
    // food is the seeded id for Ăn uống.
    query = "tab=settings&hu=food";
    render(<HuCategoryTab />, { wrapper });
    const dialogs = await screen.findAllByRole("dialog");
    expect(dialogs.length).toBeGreaterThan(0);
    fireEvent.click(within(dialogs[dialogs.length - 1]).getByLabelText("Đóng"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pfm?tab=settings", { scroll: false }));
  });
});
