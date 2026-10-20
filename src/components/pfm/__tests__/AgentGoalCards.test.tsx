import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearGoalsNamesCache, type AddAssetUi, type CloseGoalUi, type CreateGoalUi, type EditAssetUi, type EditGoalUi, type GoalActionResult } from "@/lib/agent-goal-api";

/**
 * The goal cards (chat → goals-v2): the agent only proposes; each card sends the real action to the goals API when the
 * customer confirms. `sendGoalAction` is stubbed so what is under test is the card's own validation, the order of the
 * writes and what it does when one of them is refused.
 */

const send = vi.fn<(cif: string, action: unknown) => Promise<GoalActionResult>>();
vi.mock("@/lib/agent-goal-api", async (orig) => ({ ...(await orig<typeof import("@/lib/agent-goal-api")>()), sendGoalAction: (cif: string, action: unknown) => send(cif, action) }));
vi.mock("@/providers/context", () => ({ usePersona: () => ({ persona: { cif: "CIF_TEST" } }) }));
vi.mock("@/state/app-clock", () => ({ useAppToday: () => "2026-09-15" }));

import { AgentAssetCard } from "../AgentAssetCard";
import { AgentGoalAdjustCard } from "../AgentGoalAdjustCard";
import { AgentGoalCreateCard } from "../AgentGoalCreateCard";

let seq = 0;
const unique = () => `Lý do ${(seq += 1)}`; // a fresh proposal key per test, never "already applied"
const OK: GoalActionResult = { ok: true };
const calls = () => send.mock.calls.map((c) => c[1] as { type: string; [k: string]: unknown });

beforeEach(() => {
  send.mockReset().mockResolvedValue(OK);
  window.sessionStorage.clear();
  clearGoalsNamesCache();
  vi.unstubAllGlobals();
});

const createForm = (over: Partial<CreateGoalUi> = {}): CreateGoalUi => ({
  type: "create_goal", goal_name: "Mua xe", template: "car", target_amount: 600_000_000, target_date: "2027-12-31",
  initial_deposit: 5_000_000, reason: unique(), ...over,
});

describe("AgentGoalCreateCard", () => {
  it("shows the proposal and, on confirm, sends ONE createGoal with the opening deposit (no draft, no openAccount)", async () => {
    send.mockResolvedValueOnce({ ok: true, createdGoalId: "goal-7" });
    render(<AgentGoalCreateCard form={createForm()} />);
    expect((screen.getByLabelText("Tên mục tiêu") as HTMLInputElement).value).toBe("Mua xe");
    expect((screen.getByLabelText("Nạp ban đầu") as HTMLInputElement).value).toBe("5000000");
    expect(screen.queryByLabelText("Mức linh hoạt")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã tạo mục tiêu" })).toBeDisabled());
    expect(calls()).toEqual([
      { type: "createGoal", input: { name: "Mua xe", template: "car", targetAmount: 600_000_000, targetDate: "2027-12-31", flexibility: "date_flexible", initialDeposit: 5_000_000 } },
    ]);
  });

  it("tells the chat the goal was created, with the name the customer confirmed, once", async () => {
    const onCreated = vi.fn();
    render(<AgentGoalCreateCard form={createForm()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Tên mục tiêu"), { target: { value: "Xe gia đình" } });
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith("Xe gia đình");
  });

  it("does not tell the chat when the goal was refused, nor when the card is re-rendered as already applied", async () => {
    const onCreated = vi.fn();
    send.mockResolvedValueOnce({ ok: false, error: "Từ chối" });
    const form = createForm();
    const { unmount } = render(<AgentGoalCreateCard form={form} onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(screen.getByText("Từ chối")).toBeTruthy());
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    unmount();
    render(<AgentGoalCreateCard form={form} onCreated={onCreated} />); // same proposal again: shown as done, no new message
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("sends what the customer edited, not the agent's first draft", async () => {
    render(<AgentGoalCreateCard form={createForm()} />);
    fireEvent.change(screen.getByLabelText("Tên mục tiêu"), { target: { value: "Xe gia đình" } });
    fireEvent.change(screen.getByLabelText("Số tiền mục tiêu"), { target: { value: "700000000" } });
    fireEvent.change(screen.getByLabelText("Nạp ban đầu"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(calls()[0]).toMatchObject({ input: { name: "Xe gia đình", targetAmount: 700_000_000, initialDeposit: 0 } });
  });

  it("carries the monthly plan into the auto-debit and lets the customer change it", async () => {
    render(<AgentGoalCreateCard form={createForm({ monthly_amount: 8_000_000, monthly_day: 6 })} />);
    expect((screen.getByLabelText("Góp mỗi tháng") as HTMLInputElement).value).toBe("8000000");
    expect((screen.getByLabelText("Ngày trích hằng tháng") as HTMLSelectElement).value).toBe("6");
    fireEvent.change(screen.getByLabelText("Góp mỗi tháng"), { target: { value: "9000000" } });
    fireEvent.change(screen.getByLabelText("Ngày trích hằng tháng"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(calls()[0]).toMatchObject({ input: { standingOrder: { amount: 9_000_000, dayOfMonth: 10 } } });
  });

  it("sends no auto-debit when the plan is empty", async () => {
    render(<AgentGoalCreateCard form={createForm()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((calls()[0].input as Record<string, unknown>).standingOrder).toBeUndefined();
  });

  it("refuses a date that is not after the app's today, and sends nothing", () => {
    render(<AgentGoalCreateCard form={createForm({ target_date: "2026-09-15" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("sau hôm nay");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses an empty amount or deposit", () => {
    render(<AgentGoalCreateCard form={createForm()} />);
    fireEvent.change(screen.getByLabelText("Số tiền mục tiêu"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("lớn hơn 0");
    fireEvent.change(screen.getByLabelText("Số tiền mục tiêu"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Nạp ban đầu"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("nạp ban đầu");
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the goal is refused and allows a retry, since nothing was created", async () => {
    send.mockResolvedValueOnce({ ok: false, error: "Tài khoản chính không đủ số dư để nạp ban đầu." }).mockResolvedValueOnce(OK);
    render(<AgentGoalCreateCard form={createForm()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await screen.findByText("Tài khoản chính không đủ số dư để nạp ban đầu.");
    fireEvent.change(screen.getByLabelText("Nạp ban đầu"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo mục tiêu" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã tạo mục tiêu" })).toBeDisabled());
    expect(calls().map((c) => c.type)).toEqual(["createGoal", "createGoal"]);
    expect(calls()[1]).toMatchObject({ input: { initialDeposit: 1_000_000 } });
  });
});

const editForm = (over: Partial<EditGoalUi> = {}): EditGoalUi => ({ type: "edit_goal", goal_id: "goal-1", goal_name: "Mua xe", reason: unique(), ...over });

describe("AgentGoalAdjustCard — edit_goal", () => {
  it("sends extend for a new date", async () => {
    render(<AgentGoalAdjustCard form={editForm({ new_target_date: "2028-03-31" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mục tiêu" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã cập nhật mục tiêu" })).toBeDisabled());
    expect(calls()).toEqual([{ type: "extend", goalId: "goal-1", newTargetDate: "2028-03-31" }]);
  });

  it("shows only the fields the proposal changes", () => {
    render(<AgentGoalAdjustCard form={editForm({ new_target_amount: 500_000_000 })} />);
    expect(screen.queryByLabelText("Ngày hoàn thành mới")).toBeNull();
    expect((screen.getByLabelText("Số tiền mục tiêu mới") as HTMLInputElement).value).toBe("500000000");
  });

  it("refuses a new date that is not after today", () => {
    render(<AgentGoalAdjustCard form={editForm({ new_target_date: "2026-09-15" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mục tiêu" }));
    expect(screen.getByRole("alert")).toHaveTextContent("sau hôm nay");
    expect(send).not.toHaveBeenCalled();
  });

  it("when the amount is refused after the date went through, says so and a retry sends only the amount", async () => {
    send.mockResolvedValueOnce(OK).mockResolvedValueOnce({ ok: false, error: "Số tiền mục tiêu không hợp lệ." }).mockResolvedValue(OK);
    render(<AgentGoalAdjustCard form={editForm({ new_target_date: "2028-03-31", new_target_amount: 500_000_000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mục tiêu" }));
    await screen.findByText(/Đã đổi ngày nhưng chưa đổi được số tiền: Số tiền mục tiêu không hợp lệ/);
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mục tiêu" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã cập nhật mục tiêu" })).toBeDisabled());
    expect(calls().map((c) => c.type)).toEqual(["extend", "reduceTarget", "reduceTarget"]);
  });
});

describe("AgentGoalAdjustCard — monthly plan", () => {
  it("sets the auto-debit after the target changes, with the amount the customer chose", async () => {
    render(<AgentGoalAdjustCard form={editForm({ new_target_amount: 500_000_000, monthly_amount: 6_000_000, monthly_day: 6 })} />);
    fireEvent.change(screen.getByLabelText("Góp mỗi tháng (trích tự động)"), { target: { value: "7000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mục tiêu" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã cập nhật mục tiêu" })).toBeDisabled());
    expect(calls().map((c) => c.type)).toEqual(["reduceTarget", "setStandingOrder"]);
    expect(calls()[1]).toMatchObject({ goalId: "goal-1", amount: 7_000_000, dayOfMonth: 6 });
  });

  it("a plan-only proposal sends just the auto-debit", async () => {
    render(<AgentGoalAdjustCard form={editForm({ monthly_amount: 4_000_000, monthly_day: 15 })} />);
    expect(screen.queryByLabelText("Số tiền mục tiêu mới")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật mục tiêu" }));
    await waitFor(() => expect(calls()).toEqual([{ type: "setStandingOrder", goalId: "goal-1", amount: 4_000_000, dayOfMonth: 15 }]));
  });
});

describe("AgentGoalAdjustCard — close_goal", () => {
  const closeForm = (): CloseGoalUi => ({ type: "close_goal", goal_id: "goal-1", goal_name: "Mua xe", reason: unique() });

  it("needs the customer's explicit tick before the close button works", async () => {
    render(<AgentGoalAdjustCard form={closeForm()} />);
    expect(screen.getByText(/không hoàn tác được/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Đóng mục tiêu" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Tôi hiểu và muốn đóng mục tiêu này"));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã đóng mục tiêu" })).toBeDisabled());
    expect(calls()).toEqual([{ type: "closeGoal", goalId: "goal-1" }]);
  });

  it("shows why the server refused (e.g. an open loan) and can be tried again", async () => {
    send.mockResolvedValueOnce({ ok: false, error: "Còn khoản vay chưa trả hết — chưa thể đóng mục tiêu." });
    render(<AgentGoalAdjustCard form={closeForm()} />);
    fireEvent.click(screen.getByLabelText("Tôi hiểu và muốn đóng mục tiêu này"));
    fireEvent.click(screen.getByRole("button", { name: "Đóng mục tiêu" }));
    await screen.findByText(/Còn khoản vay/);
    expect(screen.getByRole("button", { name: "Đóng mục tiêu" })).toBeEnabled();
  });
});

const addForm = (over: Partial<AddAssetUi>): AddAssetUi =>
  ({ type: "add_asset", goal_id: "goal-1", category: "motorbike", asset_name: "Xe máy Honda", count_percent: 100, reason: unique(), ...over }) as AddAssetUi;

describe("AgentAssetCard — add_asset", () => {
  it("adds a hand-valued asset as self-reported", async () => {
    render(<AgentAssetCard form={addForm({ value: 30_000_000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(calls()[0]).toEqual({ type: "addAsset", goalId: "goal-1", name: "Xe máy Honda", category: "motorbike", countPercent: 100, value: 30_000_000, source: "self_reported" });
  });

  it("adds a market asset by code and quantity (value is left to the market price)", async () => {
    render(<AgentAssetCard form={addForm({ category: "stock", asset_name: "Cổ phiếu ACB", instrument_id: "stock-acb", quantity: 1000, count_percent: 80, institution: "SSI" })} />);
    fireEvent.change(screen.getByLabelText("Số lượng"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(calls()[0]).toMatchObject({ type: "addAsset", category: "stock", instrumentId: "stock-acb", quantity: 1500, countPercent: 80, institution: "SSI", value: 0, source: "estimated" });
  });

  it("adds a deposit with its interest terms", async () => {
    render(<AgentAssetCard form={addForm({ category: "deposit", asset_name: "Gửi VCB", accrual: { principal: 50_000_000, rate_pa: 5.2, start_date: "2026-06-01", maturity_date: "2027-06-01" } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(calls()[0]).toMatchObject({ category: "deposit", value: 50_000_000, accrual: { principal: 50_000_000, ratePa: 5.2, startDate: "2026-06-01", maturityDate: "2027-06-01" } });
  });

  it("blocks a percent above 100, a zero quantity and a maturity before the start — sending nothing", () => {
    const { unmount } = render(<AgentAssetCard form={addForm({ value: 1_000 })} />);
    fireEvent.change(screen.getByLabelText("Phần tính vào mục tiêu (%)"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    expect(screen.getByRole("alert")).toHaveTextContent("0 đến 100%");
    unmount();
    const market = render(<AgentAssetCard form={addForm({ category: "gold", instrument_id: "gold-ring", quantity: 2 })} />);
    fireEvent.change(screen.getByLabelText("Số lượng"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    expect(screen.getByRole("alert")).toHaveTextContent("lớn hơn 0");
    market.unmount();
    render(<AgentAssetCard form={addForm({ category: "deposit", accrual: { principal: 1_000, rate_pa: 5, start_date: "2026-06-01" } })} />);
    fireEvent.change(screen.getByLabelText("Ngày đáo hạn (nếu có)"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    expect(screen.getByRole("alert")).toHaveTextContent("sau ngày bắt đầu");
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the add is refused", async () => {
    send.mockResolvedValueOnce({ ok: false, error: "Không tìm thấy mục tiêu." });
    render(<AgentAssetCard form={addForm({ value: 1_000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    await screen.findByText("Không tìm thấy mục tiêu.");
  });
});

describe("AgentAssetCard — add_asset, every category", () => {
  const HAND = { value: 2_000_000_000 };
  const ACCRUAL = { accrual: { principal: 100_000_000, rate_pa: 9, start_date: "2026-03-01", maturity_date: "2029-03-01" } };
  const CASES: { category: AddAssetUi["category"]; extra: Partial<AddAssetUi>; expected: Record<string, unknown> }[] = [
    { category: "house", extra: HAND, expected: { value: 2_000_000_000, source: "self_reported" } },
    { category: "car", extra: { value: 600_000_000 }, expected: { value: 600_000_000, source: "self_reported" } },
    { category: "motorbike", extra: { value: 30_000_000 }, expected: { value: 30_000_000, source: "self_reported" } },
    { category: "other", extra: { value: 80_000_000 }, expected: { value: 80_000_000, source: "self_reported" } },
    { category: "gold", extra: { instrument_id: "gold-ring", quantity: 2 }, expected: { instrumentId: "gold-ring", quantity: 2, value: 0, source: "estimated" } },
    { category: "stock", extra: { instrument_id: "stock-acb", quantity: 1000 }, expected: { instrumentId: "stock-acb", quantity: 1000, value: 0, source: "estimated" } },
    { category: "external_fund", extra: { instrument_id: "fund-AEIF", quantity: 500 }, expected: { instrumentId: "fund-AEIF", quantity: 500, value: 0, source: "estimated" } },
    { category: "deposit", extra: { accrual: { principal: 50_000_000, rate_pa: 5.2, start_date: "2026-06-01", maturity_date: "2027-06-01" } },
      expected: { value: 50_000_000, source: "estimated", accrual: { principal: 50_000_000, ratePa: 5.2, startDate: "2026-06-01", maturityDate: "2027-06-01" } } },
    { category: "bond", extra: ACCRUAL, expected: { value: 100_000_000, source: "estimated", accrual: { principal: 100_000_000, ratePa: 9, startDate: "2026-03-01", maturityDate: "2029-03-01" } } },
  ];

  for (const { category, extra, expected } of CASES) {
    it(`${category}: shows its own fields and sends the matching addAsset`, async () => {
      render(<AgentAssetCard form={addForm({ category, asset_name: `Tài sản ${category}`, count_percent: 60, ...extra })} />);
      const group = ["house", "car", "motorbike", "other"].includes(category) ? "hand" : ["gold", "stock", "external_fund"].includes(category) ? "market" : "accrual";
      expect(screen.queryByLabelText("Giá trị (VND)") !== null).toBe(group === "hand");
      expect(screen.queryByLabelText("Số lượng") !== null).toBe(group === "market");
      expect(screen.queryByLabelText("Số tiền gốc (VND)") !== null).toBe(group === "accrual");
      fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
      await waitFor(() => expect(send).toHaveBeenCalled());
      expect(calls()[0]).toMatchObject({ type: "addAsset", goalId: "goal-1", category, countPercent: 60, ...expected });
    });
  }
});

const editAsset = (over: Partial<EditAssetUi>): EditAssetUi =>
  ({ type: "edit_asset", asset_id: "asset-4", asset_name: "Xe máy Honda", change: "revalue", reason: unique(), ...over }) as EditAssetUi;

describe("AgentAssetCard — edit_asset", () => {
  it("revalues a hand-valued asset", async () => {
    render(<AgentAssetCard form={editAsset({ value: 28_000_000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật tài sản" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(calls()[0]).toEqual({ type: "revalueAsset", assetId: "asset-4", value: 28_000_000 });
  });

  it("changes a quantity", async () => {
    render(<AgentAssetCard form={editAsset({ change: "quantity", quantity: 1500 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật tài sản" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(calls()[0]).toEqual({ type: "setAssetQuantity", assetId: "asset-4", quantity: 1500 });
  });

  it("removes an asset from the goal", async () => {
    render(<AgentAssetCard form={editAsset({ change: "remove" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ tài sản" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã bỏ tài sản" })).toBeDisabled());
    expect(calls()).toEqual([{ type: "removeAsset", assetId: "asset-4" }]);
  });

  it("refuses an empty value", () => {
    render(<AgentAssetCard form={editAsset({ value: 1_000 })} />);
    fireEvent.change(screen.getByLabelText("Giá trị mới (VND)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật tài sản" }));
    expect(screen.getByRole("alert")).toHaveTextContent("lớn hơn 0");
    expect(send).not.toHaveBeenCalled();
  });
});


describe("asset cards say which goal they are about (names looked up from pfm)", () => {
  const NAMES = {
    goals: [{ id: "goal-1", name: "Mua Xe VF3", status: "accumulating" }],
    assets: [{ id: "asset-4", goalId: "goal-1", name: "Xe máy Honda" }],
  };
  const stubNames = (body: unknown, ok = true) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("add_asset shows the goal's name", async () => {
    const fetchMock = stubNames(NAMES);
    render(<AgentAssetCard form={addForm({ value: 30_000_000 })} />);
    expect(await screen.findByText("Mua Xe VF3")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/goals-v2?cif=CIF_TEST&scope=names");
  });

  it("edit_asset shows the goal the asset belongs to", async () => {
    stubNames(NAMES);
    render(<AgentAssetCard form={editAsset({ value: 28_000_000 })} />);
    expect(await screen.findByText("Mua Xe VF3")).toBeInTheDocument();
  });

  it("a goal the customer no longer has gets a warning (the server would refuse the write anyway)", async () => {
    stubNames({ goals: [], assets: [] });
    render(<AgentAssetCard form={addForm({ goal_id: "goal-9", value: 1_000 })} />);
    expect(await screen.findByText(/Không tìm thấy mục tiêu này/)).toBeInTheDocument();
  });

  it("when the names cannot be read the card still works and shows no goal line", async () => {
    stubNames({}, false);
    render(<AgentAssetCard form={addForm({ value: 1_000 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tài sản" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(screen.queryByText(/Mục tiêu:/)).toBeNull();
    expect(screen.queryByText(/Không tìm thấy mục tiêu này/)).toBeNull();
  });

  it("several cards in one chat read the names once", async () => {
    const fetchMock = stubNames(NAMES);
    render(<><AgentAssetCard form={addForm({ value: 1_000 })} /><AgentAssetCard form={addForm({ value: 2_000, asset_name: "Xe 2" })} /></>);
    await screen.findAllByText("Mua Xe VF3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
