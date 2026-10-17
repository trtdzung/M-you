import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Jar } from "@/domain/models";
import type { CurrentJarFunds } from "@/state/use-current-jar-funds";

const postLedger = vi.fn<(entries: unknown[]) => Promise<boolean>>();
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ postLedger }) }));

import { HuBalanceField } from "../HuBalanceField";

/**
 * The editor's SỐ DƯ field (plan 260923): deposit/withdraw as a 1-entry ledger
 * batch. `useJarConfig` is stubbed so the field's own states and client
 * pre-checks are what is under test; server refusals are covered in jars.test.
 */

const jar: Jar = { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000 };

function funds(over: Partial<CurrentJarFunds> & { balance?: number | null } = {}): CurrentJarFunds {
  const { balance = 1_500_000, ...rest } = over;
  return { status: "ready", pool: 3_000_000, balanceOf: () => balance, ...rest };
}

const amount = () => screen.getByLabelText("Số tiền nạp/rút");
const type = (v: string) => fireEvent.change(amount(), { target: { value: v } });

beforeEach(() => {
  postLedger.mockReset();
  postLedger.mockResolvedValue(true);
});

describe("HuBalanceField — states", () => {
  it("loading: a labelled skeleton, no buttons", () => {
    render(<HuBalanceField jar={jar} funds={{ status: "loading", pool: "unknown", balanceOf: () => null }} />);
    expect(screen.getByRole("status", { name: "Đang tải số dư hũ" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("error: says the balance could not be loaded, no buttons", () => {
    render(<HuBalanceField jar={jar} funds={{ status: "error", pool: "unknown", balanceOf: () => null }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không tải được số dư hũ. Vui lòng thử lại sau.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("empty: an unfunded jar reads 'chưa có số dư' (never 0) and offers deposit only", () => {
    render(<HuBalanceField jar={jar} funds={funds({ balance: null })} />);
    expect(screen.getByText("Hũ chưa có số dư — nạp để bắt đầu")).toBeInTheDocument();
    expect(screen.queryByText(/^0/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nạp vào hũ" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Rút về Chờ phân bổ" })).not.toBeInTheDocument();
  });

  it("insufficient data: pool unknown → deposit disabled with the reason", () => {
    render(<HuBalanceField jar={jar} funds={funds({ pool: "unknown" })} />);
    expect(screen.getByRole("button", { name: "Nạp vào hũ" })).toBeDisabled();
    expect(screen.getByText("Chưa có số dư tài khoản để nạp vào hũ.")).toBeInTheDocument();
  });

  it("shows a negative balance in text-negative, and the pool hint", () => {
    render(<HuBalanceField jar={jar} funds={funds({ balance: -200_000 })} />);
    expect(screen.getByText(/-200\.000/)).toHaveClass("text-negative");
    expect(screen.getByText(/Chờ phân bổ: 3\.000\.000.*Không chuyển tiền, không cần OTP\./)).toBeInTheDocument();
  });
});

describe("HuBalanceField — deposit / withdraw", () => {
  it("deposits a 1-entry batch and clears the field on success", async () => {
    render(<HuBalanceField jar={jar} funds={funds()} />);
    type("500.000");
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    expect(postLedger).toHaveBeenCalledWith([{ jarId: "food", kind: "deposit", amount: 500_000 }]);
    await waitFor(() => expect((amount() as HTMLInputElement).value).toBe(""));
  });

  it("withdraws back to Chờ phân bổ", async () => {
    render(<HuBalanceField jar={jar} funds={funds()} />);
    type("1500000");
    fireEvent.click(screen.getByRole("button", { name: "Rút về Chờ phân bổ" }));
    expect(postLedger).toHaveBeenCalledWith([{ jarId: "food", kind: "withdraw", amount: 1_500_000 }]);
    await waitFor(() => expect((amount() as HTMLInputElement).value).toBe(""));
  });

  it("saving: buttons off and 'Đang lưu…' while the batch is in flight", async () => {
    let resolve!: (ok: boolean) => void;
    postLedger.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    render(<HuBalanceField jar={jar} funds={funds()} />);
    type("100000");
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    expect(await screen.findByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rút về Chờ phân bổ" })).toBeDisabled();
    resolve(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Nạp vào hũ" })).toBeEnabled());
  });

  it("a refused batch keeps the typed amount (the editor shows the server reason)", async () => {
    postLedger.mockResolvedValue(false);
    render(<HuBalanceField jar={jar} funds={funds()} />);
    type("100000");
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Nạp vào hũ" })).toBeEnabled());
    expect((amount() as HTMLInputElement).value).toBe("100000");
  });

  it("caps a withdraw at the balance on the client — no request", () => {
    render(<HuBalanceField jar={jar} funds={funds()} />);
    type("2000000");
    fireEvent.click(screen.getByRole("button", { name: "Rút về Chờ phân bổ" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chỉ rút tối đa 1.500.000");
    expect(postLedger).not.toHaveBeenCalled();
  });

  it("a negative balance allows no withdraw at all (max 0)", () => {
    render(<HuBalanceField jar={jar} funds={funds({ balance: -200_000 })} />);
    type("1000");
    fireEvent.click(screen.getByRole("button", { name: "Rút về Chờ phân bổ" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Chỉ rút tối đa 0/);
    expect(postLedger).not.toHaveBeenCalled();
  });

  it("caps a deposit at Chờ phân bổ on the client — no request", () => {
    render(<HuBalanceField jar={jar} funds={funds({ pool: 3_000_000 })} />);
    type("3000001");
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chỉ còn 3.000.000");
    expect(postLedger).not.toHaveBeenCalled();
  });

  it("rejects empty / zero / malformed amounts", () => {
    render(<HuBalanceField jar={jar} funds={funds()} />);
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập số tiền lớn hơn 0.");
    type("0");
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập số tiền lớn hơn 0.");
    type("12abc");
    fireEvent.click(screen.getByRole("button", { name: "Nạp vào hũ" }));
    expect(screen.getByRole("alert")).not.toHaveTextContent("Nhập số tiền lớn hơn 0.");
    expect(postLedger).not.toHaveBeenCalled();
  });
});
