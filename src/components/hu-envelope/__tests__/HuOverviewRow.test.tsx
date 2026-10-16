import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Financials } from "@/domain/engine/finance-compose";
import type { JarEnvelopeResult, JarEnvelopeLine } from "@/domain/engine/jar-envelope";
import type { JarConfig } from "@/domain/models";
import { monthPeriod } from "@/domain/engine/types";

const JUNE = monthPeriod(2026, 5);

// Jar config comes from client state; stub it so the row is pure presentation.
const config: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống & Đi chợ", categoryIds: ["dining"], color: "#f26522", icon: "food" },
    { id: "home", label: "Nhà cửa & Tiện ích", categoryIds: ["utilities"], color: "#0e7490", icon: "home" },
  ],
};
// The sheet (opened by "Chia ngay") reads config + the batch `updateJars` writer.
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config, updateJars: vi.fn().mockResolvedValue(undefined) }) }));

import { HuOverviewRow } from "../HuOverviewRow";

function line(over: Partial<JarEnvelopeLine>): JarEnvelopeLine {
  return {
    jarId: "food", label: "Ăn uống & Đi chợ", budgetLimit: 3_000_000, spent: 500_000,
    remaining: 2_500_000, overLimit: false, inUse: true, source: "self_reported", freshness: null, ...over,
  };
}

const meta = { period: JUNE, sourceCoverage: { sources: ["mock" as const], knownCount: 1, unknownCount: 0 }, freshness: null };

function envelope(over: Partial<JarEnvelopeResult>): JarEnvelopeResult {
  return {
    pending: { amount: 5_000_000, pool: 5_000_000, allocated: 0, meta },
    jars: [line({})],
    meta,
    ...over,
  };
}

function withEnvelope(env: JarEnvelopeResult, overAllocated = false): Financials {
  return {
    jarEnvelope: env,
    unallocatedPool: { amount: overAllocated ? -1 : 0, overAllocated, source: "mock" },
  } as unknown as Financials;
}

describe("HuOverviewRow", () => {
  it("renders the 'Chờ phân bổ' card with the pending amount", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    expect(screen.getByText("Chờ phân bổ")).toBeInTheDocument();
  });

  it("renders a jar card with the label and 'còn lại trong hũ' when funded", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    expect(screen.getByText("Ăn uống & Đi chợ")).toBeInTheDocument();
    expect(screen.getByText("còn lại trong hũ")).toBeInTheDocument();
  });

  it("shows 'Chưa có số dư' for a jar with no budgetLimit, never a fabricated 0 (invariant #6)", () => {
    const env = envelope({
      jars: [
        line({
          jarId: "home",
          label: "Nhà cửa & Tiện ích",
          budgetLimit: null,
          remaining: null,
          inUse: false,
          source: "mock",
        }),
      ],
    });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
  });

  it("renders the balance for a jar with a budgetLimit (số dư gốc = hạn mức)", () => {
    const env = envelope({
      jars: [
        line({
          jarId: "home",
          label: "Nhà cửa & Tiện ích",
          budgetLimit: 2_000_000,
          spent: 500_000,
          remaining: 1_500_000,
          source: "self_reported",
        }),
      ],
    });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.queryByText("Chưa có số dư")).not.toBeInTheDocument();
    expect(screen.getByText("1,5 tr")).toBeInTheDocument();
  });

  it("floors an overspent jar at 0 and shows 'đã vượt X' — never a negative balance", () => {
    const env = envelope({ jars: [line({ budgetLimit: 1_000_000, spent: 1_500_000, remaining: -500_000 })] });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("đã vượt 500K")).toBeInTheDocument();
    // A hũ can't hold negative money: the balance floors at 0, no "-500K".
    expect(screen.getByText("0 ₫")).toBeInTheDocument();
    expect(screen.queryByText("-500K")).not.toBeInTheDocument();
  });

  it("opens the real jar view (Ngân sách) when a jar card is tapped", () => {
    const onNavigate = vi.fn();
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Hũ Ăn uống & Đi chợ/ }));
    expect(onNavigate).toHaveBeenCalledWith("budget");
  });

  it("hides the pending card once everything is allocated (known amount, 0 outstanding)", () => {
    const env = envelope({ pending: { amount: 0, pool: 5_000_000, allocated: 5_000_000, meta } });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
  });

  it("shows the pending card when the pool is unknown (no CASA account)", () => {
    const env = envelope({ pending: { amount: "unknown", pool: "unknown", allocated: 0, meta } });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("Chờ phân bổ")).toBeInTheDocument();
  });

  it("opens the allocation sheet when 'Chia ngay' is clicked", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    fireEvent.click(screen.getByRole("button", { name: /Chia ngay/ }));
    expect(screen.getByText("Đặt hạn mức cho hũ")).toBeInTheDocument();
  });

  it("renders nothing when there are no jars configured", () => {
    const { container } = render(<HuOverviewRow financials={withEnvelope(envelope({ jars: [] }))} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the 'Vượt phân bổ' badge when unallocatedPool.overAllocated is true (RT#13)", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}), true)} />);
    expect(screen.getByText("Vượt phân bổ")).toBeInTheDocument();
  });

  it("hides the 'Vượt phân bổ' badge when unallocatedPool.overAllocated is false", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}), false)} />);
    expect(screen.queryByText("Vượt phân bổ")).not.toBeInTheDocument();
  });
});
