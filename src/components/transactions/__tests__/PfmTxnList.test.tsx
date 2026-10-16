import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { AssetLiabilityProvider } from "@/state/assets";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { GoalProvider } from "@/state/goals";
import { JarConfigProvider } from "@/state/jars";
import { PeriodProvider } from "@/state/period";
import { useFinancials } from "@/state/useFinancials";
import { PfmTxnList } from "../PfmTxnList";

/**
 * PfmTxnList reads exclusively through the real provider + state stack (mock
 * provider → useFinancials → corrections/manual-txns), matching the wrapper
 * pattern in `src/app/__tests__/routes.smoke.test.tsx`. No fabricated
 * Transaction is injected anywhere here — every row comes from the seeded
 * "stable" persona dataset (`src/providers/mock/fixtures/generate.ts`), which
 * is deterministic (seeded RNG) so assertions are stable across runs.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

/** Exposes the engine-vs-list transaction counts alongside the real list UI. */
function CountProbe() {
  const { transactions, allTransactions } = useFinancials();
  return (
    <div
      data-testid="counts"
      data-engine={transactions.length}
      data-all={allTransactions.length}
    />
  );
}

function renderList() {
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
        <ManualTxnsProvider>
          <JarConfigProvider>
            <AssetLiabilityProvider>
              <GoalProvider>
                <PeriodProvider>
                  <CountProbe />
                  <PfmTxnList />
                </PeriodProvider>
              </GoalProvider>
            </AssetLiabilityProvider>
          </JarConfigProvider>
        </ManualTxnsProvider>
      </CorrectionsProvider>
    </PersonaProvider>,
  );
}

/** Wait for the initial async provider load to resolve (rows rendered). */
async function waitForLoaded(container: HTMLElement) {
  await waitFor(() => expect(container.querySelectorAll("section").length).toBeGreaterThan(0));
}

describe("PfmTxnList", () => {
  it("renders day-grouped rows from allTransactions", async () => {
    const { container } = renderList();
    await waitForLoaded(container);

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.length).toBeGreaterThan(0);

    const rows = container.querySelectorAll("section button");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("jar filter chips filter the list to that jar's categories", async () => {
    const { container } = renderList();
    await waitForLoaded(container);

    // Scope to the row list only — "Di chuyển" is ALSO a chip label, so
    // `screen.queryByText` over the whole document is ambiguous.
    const rowsText = () =>
      Array.from(container.querySelectorAll("section")).map((s) => s.textContent).join(" | ");

    // "Di chuyển" (transport) shows up in the unfiltered current-month list.
    await waitFor(() => expect(rowsText()).toContain("Di chuyển"));

    // The default template's "food" jar (dining + groceries) is chipped "Ăn uống".
    const chipGroup = screen.getByRole("group", { name: "Lọc theo hũ" });
    fireEvent.click(within(chipGroup).getByRole("button", { name: "Ăn uống" }));

    // Transport (a different jar) must no longer appear once filtered.
    await waitFor(() => expect(rowsText()).not.toContain("Di chuyển"));
    // At least one dining/groceries row remains visible.
    expect(rowsText()).toMatch(/Ăn uống|Nhu yếu phẩm/);
  });

  it("a hidden transaction renders dimmed with 'Đã ẩn' but stays listed, while the engine array excludes it", async () => {
    const { container } = renderList();
    await waitForLoaded(container);

    const counts = screen.getByTestId("counts");
    const before = Number(counts.dataset.engine);
    const beforeAll = Number(counts.dataset.all);
    expect(before).toBeGreaterThan(0);

    // Open the first visible row's detail sheet.
    const firstRow = container.querySelector("section button") as HTMLElement;
    fireEvent.click(firstRow);
    expect(screen.getByRole("dialog", { name: "Chi tiết giao dịch" })).toBeInTheDocument();

    // Flip the hidden toggle on.
    const toggle = screen.getByRole("switch", { name: "Ẩn khỏi báo cáo" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    // The engine (spend) view drops exactly one row; the list view keeps every row.
    await waitFor(() => {
      expect(Number(screen.getByTestId("counts").dataset.engine)).toBe(before - 1);
    });
    expect(Number(screen.getByTestId("counts").dataset.all)).toBe(beforeAll);

    // Close the sheet and confirm the row is still listed, dimmed, "Đã ẩn".
    fireEvent.click(screen.getAllByLabelText("Đóng")[1]);
    const label = await screen.findByText(/Đã ẩn khỏi báo cáo/);
    expect(label).toBeInTheDocument();
    const wrapper = label.closest("div");
    expect(wrapper?.className).toContain("opacity-55");
  });

  it("opening a row shows TxnDetail with amount/type rows", async () => {
    const { container } = renderList();
    await waitForLoaded(container);

    const firstRow = container.querySelector("section button") as HTMLElement;
    fireEvent.click(firstRow);

    const dialog = screen.getByRole("dialog", { name: "Chi tiết giao dịch" });
    expect(within(dialog).getByText("Ngày")).toBeInTheDocument();
    expect(within(dialog).getByText("Trạng thái")).toBeInTheDocument();
    // A money value is rendered (VND formatted amount, credit or debit sign).
    expect(dialog.textContent).toMatch(/₫/);
  });

  it("changing category via the inline picker calls setCategory (persists through corrections)", async () => {
    const { container } = renderList();
    await waitForLoaded(container);

    const firstRow = container.querySelector("section button") as HTMLElement;
    fireEvent.click(firstRow);

    const dialog = screen.getByRole("dialog", { name: "Chi tiết giao dịch" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Đổi/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Sức khỏe/ }));

    // The picker grid closes back to the summary button view.
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /Sức khỏe/ })).toBeNull());

    // The correction persisted to storage (the corrections seam, never a
    // provider mutation — invariant #4).
    const raw = window.localStorage.getItem("msb-pfm.corrections");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Record<string, { categoryId?: string }>;
    expect(Object.values(parsed).some((c) => c.categoryId === "health")).toBe(true);

    // Close the sheet — the underlying row now reflects the override (pencil
    // "Đã sửa danh mục" mark), proving the change flows back into the list.
    fireEvent.click(screen.getAllByLabelText("Đóng")[1]);
    await waitFor(() => expect(screen.getAllByLabelText("Đã sửa danh mục").length).toBeGreaterThan(0));
  });
});
