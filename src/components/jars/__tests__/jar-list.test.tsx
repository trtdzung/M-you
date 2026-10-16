import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JarPartitionLine, JarPartitionResult } from "@/domain/engine";
import { JarList } from "../JarList";

function jarLine(over: Partial<JarPartitionLine>): JarPartitionLine {
  return {
    jarId: "food",
    label: "Ăn uống",
    categoryIds: ["dining"],
    earmark: 3_000_000,
    spentThisPeriod: 1_000_000,
    spentPrevPeriod: 900_000,
    isOverBudget: false,
    perCategory: [{ categoryId: "dining", label: "Ăn uống", spent: 1_000_000 }],
    meta: { source: "mock", freshness: null },
    ...over,
  };
}

function residual(over: Partial<JarPartitionLine> = {}): JarPartitionLine {
  return {
    jarId: "unallocated",
    label: "Chưa phân bổ",
    categoryIds: [],
    earmark: 7_000_000,
    spentThisPeriod: 0,
    spentPrevPeriod: 0,
    isOverBudget: false,
    perCategory: [],
    meta: { source: "msb", freshness: null },
    isResidual: true,
    isOverAllocated: false,
    ...over,
  };
}

function partition(lines: JarPartitionLine[], status: JarPartitionResult["status"] = "ok"): JarPartitionResult {
  return { status, primaryBalance: status === "ok" ? 10_000_000 : null, lines, total: 10_000_000, meta: { source: "msb", freshness: null } };
}

describe("JarList (snapshot partition)", () => {
  it("shows an insufficient-data state when the primary balance is unknown", () => {
    render(<JarList partition={partition([], "unknown")} />);
    expect(screen.getByText(/Không xác định được tài khoản chính/)).toBeInTheDocument();
  });

  it("offers a setup link when no explicit jars are configured", () => {
    render(<JarList partition={partition([residual({ earmark: 10_000_000 })])} />);
    expect(screen.getByText("Thiết lập hũ")).toBeInTheDocument();
  });

  it("renders chia + đã tiêu and the trust line for a normal jar", () => {
    render(<JarList partition={partition([jarLine({}), residual()])} periodLabel="Tháng 6/2026" />);
    expect(screen.getByText("Ăn uống")).toBeInTheDocument();
    expect(screen.getByText(/tiền vẫn nằm nguyên trong tài khoản/)).toBeInTheDocument();
    expect(screen.getByText(/Phần chia theo số dư hiện tại/)).toBeInTheDocument();
  });

  it("marks an over-budget jar as a budget breach (non-blocking)", () => {
    render(
      <JarList
        partition={partition([jarLine({ spentThisPeriod: 4_000_000, earmark: 3_000_000, isOverBudget: true }), residual()])}
      />,
    );
    expect(screen.getAllByText(/Vượt ngân sách/).length).toBeGreaterThan(0);
  });

  it("renders the over-allocated warning when Σ chia exceeds the balance", () => {
    render(
      <JarList
        partition={partition([jarLine({ earmark: 13_000_000 }), residual({ earmark: -3_000_000, isOverAllocated: true })])}
      />,
    );
    expect(screen.getByText(/Đã chia vượt số dư/)).toBeInTheDocument();
  });

  it("shows no income UI (Model A dropped the income basis)", () => {
    render(<JarList partition={partition([jarLine({}), residual()])} />);
    expect(screen.queryByText(/thu nhập/i)).not.toBeInTheDocument();
  });
});
