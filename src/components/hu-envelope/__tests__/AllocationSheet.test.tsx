import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { JarEnvelopeResult } from "@/domain/engine";
import type { JarConfig } from "@/domain/models";
import { monthPeriod } from "@/domain/engine/types";

const postLedger = vi.fn<(entries: unknown[]) => Promise<boolean>>();
const jarState = { mutationError: null as string | null };
const config: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 8_000_000 },
    { id: "bills", label: "Hóa đơn", categoryIds: ["utilities"], budgetLimit: 5_000_000 },
    { id: "savings", label: "Tiết kiệm", categoryIds: [] },
  ],
};
vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ postLedger, mutationError: jarState.mutationError }),
}));

import { AllocationSheet } from "../AllocationSheet";

const META = { period: monthPeriod(2026, 8), sourceCoverage: { sources: ["msb" as const], knownCount: 1, unknownCount: 0 }, freshness: null };

/** A migrated jar line with no spend → balance = opening deposit = limit (spendable = limit). */
function line(jarId: string, label: string, budgetLimit: number | null) {
  return {
    jarId,
    label,
    limit: budgetLimit,
    spent: 0,
    balance: budgetLimit,
    overLimit: false,
    inUse: false,
    source: (budgetLimit === null ? "mock" : "self_reported") as "mock" | "self_reported",
    freshness: null,
  };
}

function envelope(pool: number | "unknown"): JarEnvelopeResult {
  // Opening balance = limit, no spend → Σ spendable = 13tr (food 8 + bills 5, savings unfunded).
  return {
    pending: { amount: pool === "unknown" ? "unknown" : Math.max(0, pool - 13_000_000), overAllocated: false, pool, allocated: 13_000_000, meta: META },
    jars: [line("food", "Ăn uống", 8_000_000), line("bills", "Hóa đơn", 5_000_000), line("savings", "Tiết kiệm", null)],
    meta: META,
  };
}

const onClose = vi.fn();

beforeEach(() => {
  postLedger.mockReset();
  postLedger.mockResolvedValue(true);
  jarState.mutationError = null;
  onClose.mockClear();
});

function open(pool: number | "unknown" = 18_000_000) {
  render(<AllocationSheet envelope={envelope(pool)} jars={config.jars} onClose={onClose} />);
}

describe("AllocationSheet — cộng thêm vào hũ", () => {
  it("mở sheet: mọi ô về 0 và 'Còn lại để chia' là PHẦN DƯ chưa gán (không phải toàn bộ)", () => {
    open(18_000_000);
    // Mọi ô mở ở 0 (trống, placeholder "0") — người dùng gõ số CỘNG THÊM, không sửa tổng.
    for (const label of ["Cộng thêm vào hũ Ăn uống", "Cộng thêm vào hũ Hóa đơn", "Cộng thêm vào hũ Tiết kiệm"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe("");
      expect(input.placeholder).toBe("0");
    }
    // 5 tr = 18 − 13 (phần dư chưa gán), KHÔNG phải toàn bộ 18 tr.
    expect(within(screen.getByText("Còn lại để chia").parentElement!).getByText("5 tr")).toBeInTheDocument();
  });

  it("số dư hiện tại hiện bên cạnh làm tham chiếu", () => {
    open();
    expect(screen.getAllByText(/số dư hiện tại/).length).toBeGreaterThan(0);
  });

  it("cộng thêm vào hũ: chỉ gửi SỐ DƯ cộng thêm (không đụng hạn mức)", async () => {
    open();
    // food cộng thêm 1tr → chỉ nạp thêm 1tr vào số dư, budgetLimit giữ nguyên.
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào số dư" }));
    expect(postLedger).toHaveBeenCalledTimes(1);
    // Chỉ gửi hũ được cộng, dưới dạng MỘT lô deposit; hũ không đụng tới thì bỏ qua.
    expect(postLedger).toHaveBeenCalledWith([{ jarId: "food", kind: "deposit", amount: 1_000_000 }]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("cộng vào hũ chưa có số dư: gửi đúng số cộng thêm", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Tiết kiệm"), { target: { value: "976000" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào số dư" }));
    expect(postLedger).toHaveBeenCalledWith([{ jarId: "savings", kind: "deposit", amount: 976_000 }]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("nhiều hũ trong MỘT lô (atomic), theo thứ tự hũ", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Hóa đơn"), { target: { value: "2000000" } });
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào số dư" }));
    expect(postLedger).toHaveBeenCalledTimes(1);
    expect(postLedger).toHaveBeenCalledWith([
      { jarId: "food", kind: "deposit", amount: 1_000_000 },
      { jarId: "bills", kind: "deposit", amount: 2_000_000 },
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("đang lưu: nút tắt và hiện 'Đang lưu…'", async () => {
    let resolve!: (ok: boolean) => void;
    postLedger.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    open();
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào số dư" }));
    const busy = await screen.findByRole("button", { name: "Đang lưu…" });
    expect(busy).toBeDisabled();
    resolve(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("lô bị từ chối: giữ NGUYÊN bản nháp, hiện lý do từ máy chủ, không đóng sheet", async () => {
    postLedger.mockImplementation(async () => {
      jarState.mutationError = "Vượt số dư 1.250.000 ₫ so với tài khoản. Giảm số tiền nạp vào hũ.";
      return false;
    });
    open();
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Hóa đơn"), { target: { value: "2000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào số dư" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Vượt số dư 1\.250\.000/);
    expect((screen.getByLabelText("Cộng thêm vào hũ Ăn uống") as HTMLInputElement).value).toBe("1000000");
    expect((screen.getByLabelText("Cộng thêm vào hũ Hóa đơn") as HTMLInputElement).value).toBe("2000000");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Thêm vào số dư" })).toBeEnabled();
  });

  it("lỗi cũ của thao tác khác KHÔNG hiện trong sheet trước khi sheet tự lưu", () => {
    jarState.mutationError = "Không lưu được thay đổi hũ.";
    open();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("KHÔNG cho lưu khi chưa cộng gì — mở rồi bấm Lưu là no-op", () => {
    open();
    expect(screen.getByRole("button", { name: "Thêm vào số dư" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Thêm vào số dư" }));
    expect(postLedger).not.toHaveBeenCalled();
  });

  it("chặn lưu khi cộng quá phần còn lại (Σ mới > CASA) và hiện cảnh báo", () => {
    open(18_000_000);
    // Phần dư chỉ 5tr; cộng 6tr vào food → vượt.
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "6000000" } });
    expect(screen.getByRole("button", { name: "Thêm vào số dư" })).toBeDisabled();
    expect(screen.getByText(/vượt quá số dư/i)).toBeInTheDocument();
    expect(postLedger).not.toHaveBeenCalled();
  });

  it("shows insufficient-data when the CASA pool is unknown", () => {
    open("unknown");
    expect(screen.queryByRole("button", { name: "Thêm vào số dư" })).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa có số dư tài khoản/)).toBeInTheDocument();
  });
});
