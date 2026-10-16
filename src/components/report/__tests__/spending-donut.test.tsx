import { describe, expect, it, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SpendingDonut, type JarDonutDatum } from "../SpendingDonut";

/**
 * The shared spend-by-jar donut. Presentation-only: it merges to ≤6 slices with a
 * conserving "Khác" bucket (H4 — no spend silently dropped), shows % labels, and
 * renders an empty note when nothing was spent.
 */
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const datum = (id: string, amount: number): JarDonutDatum => ({ id, label: id, amount, colorKey: id });

describe("SpendingDonut", () => {
  it("shows an empty note when there is no positive spend", () => {
    render(<SpendingDonut data={[datum("a", 0)]} legend />);
    expect(screen.getByText("Chưa có chi tiêu kỳ này.")).toBeInTheDocument();
  });

  it("renders one legend row per jar with a percentage", () => {
    render(<SpendingDonut data={[datum("food", 750_000), datum("rent", 250_000)]} legend />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("75%")).toBeInTheDocument();
    expect(within(list).getByText("25%")).toBeInTheDocument();
  });

  it("merges more than 6 jars into a conserving 'Khác' slice (H4)", () => {
    const data = Array.from({ length: 8 }, (_, i) => datum(`j${i}`, (i + 1) * 100_000));
    render(<SpendingDonut data={data} legend />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    // The smallest jars (j0=100k, j1=200k, j2=300k) fold into "Khác".
    expect(screen.getByText("Khác")).toBeInTheDocument();
  });
});
