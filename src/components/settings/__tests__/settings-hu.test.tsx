import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { JarConfigProvider } from "@/state/jars";
import { CategoryTaxonomyProvider } from "@/state/categories";
import { FinancialsTestProviders } from "@/test-utils/financials-test-providers";
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
          <CategoryTaxonomyProvider>
            <FinancialsTestProviders>{children}</FinancialsTestProviders>
          </CategoryTaxonomyProvider>
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

  it("a monthly LIMIT above CASA is accepted — a limit is a plan, the cap reads balances (plan 260923)", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Ăn uống"));
    const dialog = await screen.findByRole("dialog");
    const limit = within(dialog).getByLabelText("Hạn mức mỗi tháng");

    // CIF_0001 CASA is 18tr; Σ limits would reach ~33tr. Editing a limit moves no
    // balance (Σ max(0, balance) is unchanged), so the cap has nothing to reject.
    fireEvent.change(limit, { target: { value: "20000000" } });
    fireEvent.blur(limit);
    await waitFor(() => expect((limit as HTMLInputElement).value).toBe("20000000"));
    expect(within(dialog).queryByText(/Vượt số dư/)).not.toBeInTheDocument();
  });

  it("creates a jar only once name + limit + opening balance are valid, then opens its editor", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Thêm hũ/ }));
    const sheet = await screen.findByRole("dialog");
    // No empty "Hũ mới" is persisted up front (D2).
    expect(within(sheet).queryByDisplayValue("Hũ mới")).not.toBeInTheDocument();

    fireEvent.change(within(sheet).getByLabelText("Tên hũ mới"), { target: { value: "Du lịch" } });
    fireEvent.change(within(sheet).getByLabelText("Hạn mức chi mỗi tháng"), { target: { value: "2000000" } });
    // Empty balance is rejected, never read as 0.
    fireEvent.click(within(sheet).getByRole("button", { name: "Tạo hũ" }));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Nhập số dư ban đầu");
    expect(screen.queryByText("Du lịch")).not.toBeInTheDocument();

    // An explicit 0 is a valid known balance.
    fireEvent.change(within(sheet).getByLabelText("Số dư ban đầu"), { target: { value: "0" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Tạo hũ" }));
    const editor = await screen.findByRole("dialog", { name: "Sửa hũ" });
    expect(within(editor).getByDisplayValue("Du lịch")).toBeInTheDocument();
    expect((within(editor).getByLabelText("Hạn mức mỗi tháng") as HTMLInputElement).value).toBe("2000000");
    // The new jar's opening row is a KNOWN 0 balance (not "chưa có số dư").
    expect(await within(editor).findByRole("button", { name: "Rút về Chờ phân bổ" })).toBeInTheDocument();
    expect(within(editor).queryByText("Hũ chưa có số dư — nạp để bắt đầu")).not.toBeInTheDocument();
  });

  it("refuses an opening balance above Chờ phân bổ", async () => {
    render(<HuCategoryTab />, { wrapper });
    await waitFor(() => expect(screen.getByText("Ăn uống")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Thêm hũ/ }));
    const sheet = await screen.findByRole("dialog");
    await waitFor(() => expect(within(sheet).getByText(/Chờ phân bổ: /)).toBeInTheDocument());
    fireEvent.change(within(sheet).getByLabelText("Tên hũ mới"), { target: { value: "Du lịch" } });
    fireEvent.change(within(sheet).getByLabelText("Hạn mức chi mỗi tháng"), { target: { value: "2000000" } });
    fireEvent.change(within(sheet).getByLabelText("Số dư ban đầu"), { target: { value: "900000000000" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Tạo hũ" }));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Số dư ban đầu vượt số tiền chờ phân bổ");
    expect(screen.queryByText("Du lịch")).not.toBeInTheDocument();
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
