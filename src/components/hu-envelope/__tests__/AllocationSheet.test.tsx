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
    pending: { amount: pool === "unknown" ? "unknown" : Math.max(0, pool - 13_000_000), pool, allocated: 13_000_000, meta: META },
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

describe("AllocationSheet — số tổng mới (đặt hạn mức)", () => {
  it("prefills each jar input with its current budgetLimit and shows 'hạn mức hiện tại'", () => {
    open();
    expect((screen.getByLabelText("Hạn mức mới cho hũ Ăn uống") as HTMLInputElement).value).toBe("8000000");
    expect((screen.getByLabelText("Hạn mức mới cho hũ Hóa đơn") as HTMLInputElement).value).toBe("5000000");
    expect(screen.getAllByText(/hạn mức hiện tại/).length).toBeGreaterThan(0);
  });

  it("editing ONE jar only patches that jar — it never wipes the others (red-team C1)", () => {
    open();
    fireEvent.change(screen.getByLabelText("Hạn mức mới cho hũ Ăn uống"), { target: { value: "9000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).toHaveBeenCalledTimes(1);
    expect(updateJars).toHaveBeenCalledWith({ food: { budgetLimit: 9_000_000 } });
  });

  it("clearing a jar's input (0) clears its budgetLimit back to chưa đặt (undefined, not 0)", () => {
    open();
    fireEvent.change(screen.getByLabelText("Hạn mức mới cho hũ Hóa đơn"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hạn mức" }));
    expect(updateJars).toHaveBeenCalledWith({ bills: { budgetLimit: undefined } });
  });

  it("blocks submit when Σ hạn mức exceeds CASA (guardrail) and shows the over message", () => {
    open(18_000_000);
    // food 8tr → 20tr ⇒ Σ = 25tr > 18tr
    fireEvent.change(screen.getByLabelText("Hạn mức mới cho hũ Ăn uống"), { target: { value: "20000000" } });
    expect(screen.getByRole("button", { name: "Lưu hạn mức" })).toBeDisabled();
    expect(screen.getByText(/vượt quá số dư/i)).toBeInTheDocument();
    expect(updateJars).not.toHaveBeenCalled();
  });

  it("disables submit when nothing changed", () => {
    open();
    expect(screen.getByRole("button", { name: "Lưu hạn mức" })).toBeDisabled();
  });

  it("shows insufficient-data when the CASA pool is unknown", () => {
    open("unknown");
    expect(screen.queryByRole("button", { name: "Lưu hạn mức" })).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa có số dư tài khoản/)).toBeInTheDocument();
  });
});
