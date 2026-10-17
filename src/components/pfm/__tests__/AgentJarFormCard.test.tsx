import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JarConfig } from "@/domain/models";
import type { CurrentJarFunds } from "@/state/use-current-jar-funds";
import type { CreateJarUi, EditJarUi } from "@/lib/agent-api";

/**
 * `AgentJarFormCard` (plan 260923 Phase 05): the agent's create proposal needs a
 * SỐ DƯ BAN ĐẦU (prefilled from the required `initial_balance`, 0 allowed, empty
 * rejected, ≤ "Chờ phân bổ"); HẠN MỨC moves no money so an edit may raise it above
 * the account. Jar state, funds and categories are stubbed so the card's own
 * validation and wiring (`addJar(jar, balance)` / `updateJar`) are under test.
 */

const CONFIG: JarConfig = {
  version: 3,
  jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, createdAt: "2026-08-31T17:00:00.000Z" }],
  ledger: [],
};

const addJar = vi.fn<(jar: unknown, balance: number) => Promise<boolean>>();
const updateJar = vi.fn<(id: string, patch: unknown) => Promise<boolean>>();
const state = { mutationError: null as string | null, funds: null as CurrentJarFunds | null };

vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: CONFIG, loaded: true, addJar, updateJar, mutationError: state.mutationError, clearMutationError: vi.fn() }),
}));
vi.mock("@/state/use-current-jar-funds", async (orig) => ({
  ...(await orig<typeof import("@/state/use-current-jar-funds")>()),
  useCurrentJarFunds: () => state.funds,
}));
vi.mock("@/state/categories", () => ({
  useCategories: () => ({
    labels: new Map([["dining", "Ăn uống"], ["travel", "Du lịch"]]),
    assignable: [{ id: "dining", label: "Ăn uống" }, { id: "travel", label: "Du lịch" }],
  }),
}));
vi.mock("@/providers/context", () => ({
  usePersona: () => ({ persona: { cif: "CIF_TEST" } }),
  useProviders: () => ({ getJarConfig: async () => CONFIG }),
}));

import { AgentJarFormCard } from "../AgentJarFormCard";

const ready = (pool: CurrentJarFunds["pool"]): CurrentJarFunds => ({ status: "ready", pool, balanceOf: () => null });
let seq = 0;
const createForm = (over: Partial<CreateJarUi> = {}): CreateJarUi => ({
  type: "create_jar",
  jar_name: "Du lịch",
  allocation_amount: 2_000_000,
  initial_balance: 1_000_000,
  category_ids: ["travel"],
  reason: `Để dành đi chơi ${(seq += 1)}`, // unique → never "already applied" across tests
  ...over,
});
const balanceInput = () => screen.getByLabelText("Số dư ban đầu") as HTMLInputElement;

beforeEach(() => {
  addJar.mockReset().mockResolvedValue(true);
  updateJar.mockReset().mockResolvedValue(true);
  state.mutationError = null;
  state.funds = ready(5_000_000);
});

describe("AgentJarFormCard — create with an opening balance", () => {
  it("prefills Số dư ban đầu from initial_balance and creates with addJar(jar, balance)", async () => {
    render(<AgentJarFormCard form={createForm()} />);
    expect(balanceInput().value).toBe("1000000");
    expect(screen.getByText(/Chờ phân bổ: 5\.000\.000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    await waitFor(() => expect(addJar).toHaveBeenCalledTimes(1));
    const [jar, balance] = addJar.mock.calls[0];
    expect(jar).toMatchObject({ label: "Du lịch", budgetLimit: 2_000_000, categoryIds: ["travel"] });
    expect(balance).toBe(1_000_000);
    expect(await screen.findByRole("button", { name: "Đã tạo hũ" })).toBeDisabled();
  });

  it("an EMPTY balance is rejected — never read as 0 (invariant #6)", async () => {
    render(<AgentJarFormCard form={createForm()} />);
    fireEvent.change(balanceInput(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nhập số dư ban đầu (nhập 0 nếu chưa nạp).");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("balance 0 is an explicit, allowed value (even with the pool unknown)", async () => {
    state.funds = ready("unknown");
    render(<AgentJarFormCard form={createForm({ initial_balance: 0 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    await waitFor(() => expect(addJar).toHaveBeenCalledTimes(1));
    expect(addJar.mock.calls[0][1]).toBe(0);
  });

  it("a balance above Chờ phân bổ is rejected before any write", async () => {
    render(<AgentJarFormCard form={createForm({ initial_balance: 6_000_000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Số dư ban đầu vượt số tiền chờ phân bổ (còn 5.000.000");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("the limit is a plan, not money: a limit above the pool is fine when the balance fits", async () => {
    render(<AgentJarFormCard form={createForm({ allocation_amount: 50_000_000, initial_balance: 0 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    await waitFor(() => expect(addJar).toHaveBeenCalledTimes(1));
    expect(addJar.mock.calls[0][0]).toMatchObject({ budgetLimit: 50_000_000 });
  });

  it("pool unknown: says so and refuses a funded balance", async () => {
    state.funds = ready("unknown");
    render(<AgentJarFormCard form={createForm()} />);
    expect(screen.getByText(/Chưa có số dư tài khoản — chỉ tạo được hũ với số dư 0\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chỉ tạo được hũ với số dư 0");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("funds loading: a funded balance waits instead of guessing", async () => {
    state.funds = { status: "loading", pool: "unknown", balanceOf: () => null };
    render(<AgentJarFormCard form={createForm()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đang tải số tiền chờ phân bổ");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("a server 422 (over the CASA cap) is shown in Vietnamese and the card stays open", async () => {
    addJar.mockImplementation(async () => {
      state.mutationError = "Vượt số dư 1.000 ₫ so với tài khoản. Giảm số tiền nạp vào hũ.";
      return false;
    });
    render(<AgentJarFormCard form={createForm()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Vượt số dư 1\.000/);
    expect(screen.getByRole("button", { name: "Tạo hũ" })).toBeEnabled();
  });

  it("a stale error from another write is not shown before this card submits", () => {
    state.mutationError = "Không lưu được thay đổi hũ.";
    render(<AgentJarFormCard form={createForm()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AgentJarFormCard — edit changes the limit only", () => {
  const editForm = (over: Partial<EditJarUi> = {}): EditJarUi => ({
    type: "edit_jar",
    jar_id: "food",
    jar_name: "Ăn uống",
    allocation_amount: 90_000_000,
    reason: `Tăng hạn mức ${(seq += 1)}`,
    ...over,
  });

  it("raising the limit above the account is OK — no headroom check, no balance field", async () => {
    state.funds = ready(1_000_000);
    render(<AgentJarFormCard form={editForm()} />);
    expect(screen.queryByLabelText("Số dư ban đầu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật hũ" }));
    await waitFor(() => expect(updateJar).toHaveBeenCalledTimes(1));
    expect(updateJar.mock.calls[0]).toEqual(["food", { label: "Ăn uống", budgetLimit: 90_000_000 }]);
    expect(addJar).not.toHaveBeenCalled();
  });
});
