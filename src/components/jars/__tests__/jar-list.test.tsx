import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JarLine } from "@/domain/engine";
import { JarList } from "../JarList";

/** Minimal jar line; override the fields a case cares about. */
function line(over: Partial<JarLine>): JarLine {
  return {
    jarId: "j",
    label: "Hũ",
    categoryIds: ["dining"],
    allocated: 1_000_000,
    used: 500_000,
    pct: 0.5,
    daysLeft: 5,
    status: "ok",
    perCategory: [{ categoryId: "dining", label: "Ăn uống", used: 500_000 }],
    meta: { source: "mock", freshness: null },
    ...over,
  };
}

describe("JarList", () => {
  it("offers a setup link when no jars are configured", () => {
    render(<JarList lines={[]} stale={false} />);
    expect(screen.getByText("Thiết lập hũ")).toBeInTheDocument();
  });

  it("renders an over-budget jar with the over status", () => {
    render(<JarList lines={[line({ used: 1_200_000, pct: 1.2, status: "over" })]} stale={false} />);
    expect(screen.getByText("Vượt hạn mức")).toBeInTheDocument();
  });

  it("[C1] never shows a green 'ok' status for an unknown-income jar", () => {
    render(
      <JarList
        lines={[line({ allocated: null, pct: null, status: "unknown" })]}
        stale={false}
      />,
    );
    expect(screen.queryByText("Trong hạn mức")).not.toBeInTheDocument();
    expect(screen.getByText("đặt thu nhập")).toBeInTheDocument();
    expect(screen.getByText(/chưa xác định TN/)).toBeInTheDocument();
  });

  it("[M13] renders the unassigned bucket as a neutral label with no status", () => {
    render(
      <JarList
        lines={[
          line({
            jarId: "unassigned",
            label: "Chưa phân hũ",
            allocated: null,
            pct: null,
            status: "unknown",
            isUnassigned: true,
          }),
        ]}
        stale={false}
      />,
    );
    expect(screen.getByText("Chưa phân hũ")).toBeInTheDocument();
    expect(screen.queryByText("đặt thu nhập")).not.toBeInTheDocument();
  });

  it("[H2] suppresses the days-left urgency label on a stale month", () => {
    render(<JarList lines={[line({ daysLeft: 5, status: "near" })]} stale />);
    expect(screen.queryByText(/Còn 5 ngày/)).not.toBeInTheDocument();
  });
});
