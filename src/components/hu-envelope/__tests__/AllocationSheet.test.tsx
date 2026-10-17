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

function envelope(pool: number | "unknown"): JarEnvelopeResult {
  return {
    pending: { amount: pool === "unknown" ? "unknown" : Math.max(0, pool - 13_000_000), overAllocated: false, pool, allocated: 13_000_000, meta: META },
    jars: [],
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

describe("AllocationSheet — chia lại toàn bộ số dư", () => {
  it("mở sheet: mọi ô về 0 và 'Còn lại để chia' là TOÀN BỘ số dư, không còn phần dư lẻ", () => {
    open(18_000_000);
    // 0 hiển thị là ô trống với placeholder "0" (không phải "8000000" như prefill cũ).
    for (const label of ["Hạn mức mới cho hũ Ăn uống", "Hạn mức mới cho hũ Hóa đơn"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe("");
      expect(input.placeholder).toBe("0");
    }
    // 18 tr, KHÔNG phải 5 tr (18 − 13) như kiểu prefill cũ.
    expect(within(screen.getByText("Còn lại để chia").parentElement!).getByText("18 tr")).toBeInTheDocument();
  });

  it("hạn mức cũ vẫn hiện bên cạnh làm tham chiếu", () => {
    open();
    expect(screen.getAllByText(/hạn mức hiện tại/).length).toBeGreaterThan(0);
  });

  it("chia cho một hũ: hũ đó được đặt, hũ từng có hạn mức mà bỏ trống thì về chưa đặt", () => {
    open();
    fireEvent.change(screen.getByLabelText("Hạn mức mới cho hũ Ăn uống"), { target: { value: "9000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).toHaveBeenCalledTimes(1);
    // `savings` chưa từng có hạn mức và vẫn 0 → không gửi patch thừa.
    expect(updateJars).toHaveBeenCalledWith({ food: { budgetLimit: 9_000_000 }, bills: { budgetLimit: undefined } });
  });

  it("KHÔNG cho lưu khi chưa chia gì — mở rồi bấm Lưu không được phép xoá sạch hạn mức", () => {
    open();
    expect(screen.getByRole("button", { name: "Lưu hạn mức" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).not.toHaveBeenCalled();
  });

  it("blocks submit when Σ hạn mức exceeds CASA (guardrail) and shows the over message", () => {
    open(18_000_000);
    fireEvent.change(screen.getByLabelText("Hạn mức mới cho hũ Ăn uống"), { target: { value: "20000000" } });
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
