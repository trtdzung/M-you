import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider } from "@/providers/context";
import { JarConfigProvider } from "@/state/jars";
import { buildManualTxn, ManualTxnsProvider, useManualTxns } from "@/state/manual-txns";
import { REBALANCE_CATEGORY, type Account } from "@/domain/models";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { HuCategoryTab } from "../HuCategoryTab";

/**
 * Edge cases from the jar UI report (U8/U9/U10/U19/U20/U24) against the real
 * provider stack; faults are injected only at the fetch boundary.
 */

function LegProbe() {
  const { manualTxns } = useManualTxns();
  return <span data-testid="legs">{manualTxns.filter((t) => t.categoryId === REBALANCE_CATEGORY).length}</span>;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          {children}
          <LegProbe />
        </JarConfigProvider>
      </ManualTxnsProvider>
    </PersonaProvider>
  );
}

const json = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const isJarPatch = (url: string, init?: RequestInit) => url.startsWith("/api/jars/") && init?.method === "PATCH";

/** Route fetches through `handler` first; `null` falls back to the installed API stub. */
function interceptFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | null) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init) ?? real(input, init);
  });
}

/** Count jar PATCHes without altering them. */
function countJarPatches() {
  const calls: string[] = [];
  interceptFetch((url, init) => {
    if (isJarPatch(url, init)) calls.push(String(init?.body));
    return null;
  });
  return calls;
}

async function openEditor(label = "Ăn uống") {
  render(<HuCategoryTab />, { wrapper });
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  fireEvent.click(screen.getByText(label));
  const dialog = await screen.findByRole("dialog");
  return { dialog, limit: within(dialog).getByLabelText("Hạn mức mỗi tháng") as HTMLInputElement };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("HuCategoryTab — load states (U10)", () => {
  it("shows loading, then an error with retry instead of the empty jar list", async () => {
    let fail = true;
    interceptFetch((url, init) =>
      fail && url.startsWith("/api/jars") && (init?.method ?? "GET") === "GET" ? Promise.resolve(json({}, 500)) : null,
    );
    render(<HuCategoryTab />, { wrapper });
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải danh sách hũ");
    expect(await screen.findByText(/Không tải được danh sách hũ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm hũ/ })).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Ăn uống")).toBeInTheDocument();
  });
});

describe("HuEditorSheet — limit input (U19/U24)", () => {
  it("accepts the hint's own dot-grouped format", async () => {
    const patches = countJarPatches();
    const { dialog, limit } = await openEditor();
    fireEvent.change(limit, { target: { value: "5.000.000" } });
    fireEvent.blur(limit);
    await waitFor(() => expect(limit.value).toBe("5000000"));
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0]).patch.budgetLimit).toBe(5_000_000);
    expect(within(dialog).queryByText(/Chỉ nhập số tiền/)).not.toBeInTheDocument();
  });

  it.each(["1e5", "0x10", "+5", "0.4", "12345678901234567890", "-5"])(
    "rejects %j inline and sends nothing",
    async (raw) => {
      const patches = countJarPatches();
      const { limit } = await openEditor();
      fireEvent.change(limit, { target: { value: raw } });
      fireEvent.blur(limit);
      expect(limit).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText(/Chỉ nhập số tiền|quá lớn|Không được âm/)).toBeInTheDocument();
      expect(patches).toHaveLength(0);
    },
  );

  it("does not PATCH when an unchanged limit is blurred (incl. a reformatted equal value)", async () => {
    const patches = countJarPatches();
    const { limit } = await openEditor();
    expect(limit.value).toBe("4000000");
    fireEvent.blur(limit);
    fireEvent.change(limit, { target: { value: "4.000.000" } });
    fireEvent.blur(limit);
    expect(limit.value).toBe("4000000");
    expect(patches).toHaveLength(0);
  });
});

describe("HuEditorSheet — CASA cap uses 'only raises are capped' (U9)", () => {
  it("lets a limit be LOWERED when Σ is already over the live balance, blocks a raise", async () => {
    // Spend CIF_0001's current accounts down to 0 → Σ limits (17tr) > CASA.
    const accounts = (await (await fetch("/api/accounts?cif=CIF_0001")).json()) as Account[];
    for (const a of accounts.filter((x) => x.type === "current")) {
      await fetch("/api/accounts/debit", {
        method: "POST",
        body: JSON.stringify({ cif: "CIF_0001", accountId: a.id, amount: a.availableBalance }),
      });
    }
    const patches = countJarPatches();
    const { dialog, limit } = await openEditor();

    fireEvent.change(limit, { target: { value: "3.500.000" } });
    fireEvent.blur(limit);
    await waitFor(() => expect(limit.value).toBe("3500000"));
    expect(patches).toHaveLength(1);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(limit, { target: { value: "4000000" } });
    fireEvent.blur(limit);
    expect(await within(dialog).findByText(/Vượt số dư tài khoản/)).toBeInTheDocument();
    expect(patches).toHaveLength(1);
  });
});

describe("HuEditorSheet — failed writes are visible (U20)", () => {
  it("shows an alert when a role PATCH fails and keeps the persisted role", async () => {
    interceptFetch((url, init) => (isJarPatch(url, init) ? Promise.resolve(json({ error: "db" }, 500)) : null));
    const { dialog } = await openEditor();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Mục tiêu/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Không lưu được/);
    expect(within(dialog).getByRole("button", { name: /^Tùy ý/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /^Mục tiêu/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the server's over-cap reason and snaps the limit back to the stored value", async () => {
    interceptFetch((url, init) =>
      isJarPatch(url, init) ? Promise.resolve(json({ error: "over CASA cap", overBy: 1000 }, 422)) : null,
    );
    const { dialog, limit } = await openEditor();
    fireEvent.change(limit, { target: { value: "3000000" } });
    fireEvent.blur(limit);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Vượt số dư 1\.000/);
    await waitFor(() => expect(limit.value).toBe("4000000"));
  });
});

describe("HuEditorSheet — delete with rebalance legs (U8)", () => {
  function seedLeg() {
    const leg = buildManualTxn({
      amount: 204_000,
      direction: "debit",
      categoryId: REBALANCE_CATEGORY,
      merchantName: "Điều chỉnh hũ",
      postedAt: new Date().toISOString(),
      type: "transfer",
      rebalance: { fromJarId: "lifestyle", toJarId: "food", triggerTxnId: "t-1", origin: "auto" },
    });
    // The manual-txn API isn't stubbed in tests, so the provider loads the legacy store.
    window.localStorage.setItem("msb-pfm.manual-txns.CIF_0001", JSON.stringify([leg]));
  }

  it("warns about the jar's 'điều chỉnh hũ' movements and drops them after delete", async () => {
    seedLeg();
    const { dialog } = await openEditor("Hưởng thụ");
    await waitFor(() => expect(screen.getByTestId("legs")).toHaveTextContent("1"));
    fireEvent.click(within(dialog).getByRole("button", { name: /Xoá hũ/ }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      /1 khoản “Điều chỉnh hũ”.*xoá luôn.*tính lại các hũ liên quan: Ăn uống/,
    );
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Xoá hũ" })[0]);
    await waitFor(() => expect(screen.queryByText("Hưởng thụ")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("legs")).toHaveTextContent("0"));
  });

  it("shows no leg warning for a jar without legs", async () => {
    seedLeg();
    const { dialog } = await openEditor("Di chuyển");
    await waitFor(() => expect(screen.getByTestId("legs")).toHaveTextContent("1"));
    fireEvent.click(within(dialog).getByRole("button", { name: /Xoá hũ/ }));
    expect(within(dialog).getByText(/Danh mục trong hũ sẽ chuyển sang “Khác”/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});
