import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CurrentJarFunds } from "@/state/use-current-jar-funds";

const addJar = vi.fn<(jar: unknown, balance: number) => Promise<boolean>>();
const jarState = { mutationError: null as string | null };
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ addJar, mutationError: jarState.mutationError }) }));

import { HuCreateSheet } from "../HuCreateSheet";

/**
 * "Thêm hũ" (plan 260923 D2): name + hạn mức + số dư ban đầu, all required;
 * balance 0 is a valid known value, empty is not. `useJarConfig` is stubbed so the
 * sheet's validation and states are what is under test.
 */

const onCreated = vi.fn();
const onClose = vi.fn();
const ready = (pool: CurrentJarFunds["pool"] = 5_000_000): CurrentJarFunds => ({ status: "ready", pool, balanceOf: () => null });

function open(funds: CurrentJarFunds = ready()) {
  render(<HuCreateSheet funds={funds} onCreated={onCreated} onClose={onClose} />);
}
function fill({ name = "Du lịch", limit = "2.000.000", balance = "" }: { name?: string; limit?: string; balance?: string }) {
  fireEvent.change(screen.getByLabelText("Tên hũ mới"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Hạn mức chi mỗi tháng"), { target: { value: limit } });
  fireEvent.change(screen.getByLabelText("Số dư ban đầu"), { target: { value: balance } });
}
const create = () => fireEvent.click(screen.getByRole("button", { name: "Tạo hũ" }));

beforeEach(() => {
  addJar.mockReset();
  addJar.mockResolvedValue(true);
  onCreated.mockClear();
  onClose.mockClear();
  jarState.mutationError = null;
});

describe("HuCreateSheet — validation", () => {
  it("requires a name", () => {
    open();
    fill({ name: "  ", balance: "0" });
    create();
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập tên hũ.");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("requires a limit (empty is not 0)", () => {
    open();
    fill({ limit: "", balance: "0" });
    create();
    expect(screen.getByRole("alert")).toHaveTextContent("Hạn mức: Nhập hạn mức chi mỗi tháng.");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("rejects an EMPTY opening balance — never read as 0 (invariant #6)", () => {
    open();
    fill({ balance: "" });
    create();
    expect(screen.getByRole("alert")).toHaveTextContent("Số dư: Nhập số dư ban đầu (nhập 0 nếu chưa nạp).");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("rejects an opening balance above Chờ phân bổ", () => {
    open(ready(5_000_000));
    fill({ balance: "6.000.000" });
    create();
    expect(screen.getByRole("alert")).toHaveTextContent("Số dư ban đầu vượt số tiền chờ phân bổ (còn 5.000.000");
    expect(addJar).not.toHaveBeenCalled();
  });

  it("pool unknown (insufficient data): only a 0 balance can be created", async () => {
    open(ready("unknown"));
    expect(screen.getByText(/Chưa có số dư tài khoản — chỉ tạo được hũ với số dư 0\./)).toBeInTheDocument();
    fill({ balance: "100000" });
    create();
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa có số dư tài khoản — chỉ tạo được hũ với số dư 0.");
    expect(addJar).not.toHaveBeenCalled();
    fill({ balance: "0" });
    create();
    await waitFor(() => expect(addJar).toHaveBeenCalledTimes(1));
  });

  it("loading funds: says so, and still allows a 0 balance", async () => {
    open({ status: "loading", pool: "unknown", balanceOf: () => null });
    expect(screen.getByText(/Đang tải số tiền chờ phân bổ…/)).toBeInTheDocument();
    fill({ balance: "0" });
    create();
    await waitFor(() => expect(addJar).toHaveBeenCalledTimes(1));
  });
});

describe("HuCreateSheet — create", () => {
  it("balance 0 is accepted: ONE addJar with the limit and an explicit 0", async () => {
    open();
    fill({ balance: "0" });
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const [jar, balance] = addJar.mock.calls[0];
    expect(jar).toMatchObject({ label: "Du lịch", categoryIds: [], budgetLimit: 2_000_000 });
    expect(balance).toBe(0);
    expect(onCreated).toHaveBeenCalledWith((jar as { id: string }).id);
  });

  it("a funded opening balance within the pool is sent as-is", async () => {
    open(ready(5_000_000));
    fill({ balance: "5.000.000" });
    create();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(addJar.mock.calls[0][1]).toBe(5_000_000);
  });

  it("saving: button off with 'Đang lưu…'", async () => {
    let resolve!: (ok: boolean) => void;
    addJar.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    open();
    fill({ balance: "0" });
    create();
    expect(await screen.findByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    resolve(true);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("a server refusal shows its reason, keeps the sheet open and the inputs", async () => {
    addJar.mockImplementation(async () => {
      jarState.mutationError = "Vượt số dư 1.000 ₫ so với tài khoản. Giảm số tiền nạp vào hũ.";
      return false;
    });
    open();
    fill({ balance: "1.000.000" });
    create();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Vượt số dư 1\.000/);
    expect(onCreated).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Tên hũ mới") as HTMLInputElement).value).toBe("Du lịch");
    expect((screen.getByLabelText("Số dư ban đầu") as HTMLInputElement).value).toBe("1.000.000");
  });

  it("a stale error from another write is not shown before this sheet submits", () => {
    jarState.mutationError = "Không lưu được thay đổi hũ.";
    open();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
