import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { JarEnvelopeResult } from "@/domain/engine";
import type { JarConfig } from "@/domain/models";
import { monthPeriod } from "@/domain/engine/types";

const updateJars = vi.fn().mockResolvedValue(undefined);
const config: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 8_000_000 },
    { id: "bills", label: "Hóa đơn", categoryIds: ["utilities"], budgetLimit: 5_000_000 },
    { id: "savings", label: "Tiết kiệm", categoryIds: [] },
  ],
};
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config, updateJars }) }));

import { AllocationSheet } from "../AllocationSheet";

const META = { period: monthPeriod(2026, 8), sourceCoverage: { sources: ["msb" as const], knownCount: 1, unknownCount: 0 }, freshness: null };

/** A jar line with no spend → remaining = budgetLimit (spendable = limit). */
function line(jarId: string, label: string, budgetLimit: number | null) {
  return {
    jarId,
    label,
    budgetLimit,
    spent: 0,
    remaining: budgetLimit,
    overLimit: false,
    inUse: false,
    source: (budgetLimit === null ? "mock" : "self_reported") as "mock" | "self_reported",
    freshness: null,
  };
}

function envelope(pool: number | "unknown"): JarEnvelopeResult {
  // No spend → Σ spendable = Σ budgetLimit = 13tr (food 8 + bills 5, savings unset).
  return {
    pending: { amount: pool === "unknown" ? "unknown" : Math.max(0, pool - 13_000_000), overAllocated: false, pool, allocated: 13_000_000, meta: META },
    jars: [line("food", "Ăn uống", 8_000_000), line("bills", "Hóa đơn", 5_000_000), line("savings", "Tiết kiệm", null)],
    meta: META,
  };
}

const onClose = vi.fn();

beforeEach(() => {
  updateJars.mockClear();
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

  it("hạn mức hiện tại vẫn hiện bên cạnh làm tham chiếu", () => {
    open();
    expect(screen.getAllByText(/hạn mức hiện tại/).length).toBeGreaterThan(0);
  });

  it("cộng thêm vào hũ đã có hạn mức: hạn mức mới = hiện có + số cộng thêm", () => {
    open();
    // food đang 8tr, cộng thêm 1tr → 9tr.
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).toHaveBeenCalledTimes(1);
    // Chỉ gửi hũ được cộng; hũ không đụng tới thì bỏ qua.
    expect(updateJars).toHaveBeenCalledWith({ food: { budgetLimit: 9_000_000 } });
  });

  it("cộng vào hũ chưa đặt hạn mức: hạn mức mới = đúng số cộng thêm", () => {
    open();
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Tiết kiệm"), { target: { value: "976000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).toHaveBeenCalledWith({ savings: { budgetLimit: 976_000 } });
  });

  it("KHÔNG cho lưu khi chưa cộng gì — mở rồi bấm Lưu là no-op", () => {
    open();
    expect(screen.getByRole("button", { name: "Lưu hạn mức" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).not.toHaveBeenCalled();
  });

  it("chặn lưu khi cộng quá phần còn lại (Σ mới > CASA) và hiện cảnh báo", () => {
    open(18_000_000);
    // Phần dư chỉ 5tr; cộng 6tr vào food → vượt.
    fireEvent.change(screen.getByLabelText("Cộng thêm vào hũ Ăn uống"), { target: { value: "6000000" } });
    expect(screen.getByRole("button", { name: "Lưu hạn mức" })).toBeDisabled();
    expect(screen.getByText(/vượt quá số dư/i)).toBeInTheDocument();
    expect(updateJars).not.toHaveBeenCalled();
  });

  it("shows insufficient-data when the CASA pool is unknown", () => {
    open("unknown");
    expect(screen.queryByRole("button", { name: "Lưu hạn mức" })).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa có số dư tài khoản/)).toBeInTheDocument();
  });
});
