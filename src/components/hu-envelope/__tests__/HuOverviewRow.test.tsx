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
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config }) }));
// The sheet (opened by "Chia ngay") pulls the allocate action from state.
vi.mock("@/state/jar-allocations", () => ({ useJarAllocations: () => ({ allocate: vi.fn() }) }));

import { HuOverviewRow } from "../HuOverviewRow";

function line(over: Partial<JarEnvelopeLine>): JarEnvelopeLine {
  return {
    jarId: "food", label: "Ăn uống & Đi chợ", funded: 3_000_000, spent: 500_000,
    remaining: 2_500_000, inUse: true, source: "self_reported", freshness: null, ...over,
  };
}

const meta = { period: JUNE, sourceCoverage: { sources: ["mock" as const], knownCount: 1, unknownCount: 0 }, freshness: null };

function envelope(over: Partial<JarEnvelopeResult>): JarEnvelopeResult {
  return {
    pending: { amount: 5_000_000, unallocatedCount: 2, unallocatedTxnIds: ["t1", "t2"], perTxn: [], meta },
    jars: [line({})],
    meta,
    ...over,
  };
}

function withEnvelope(env: JarEnvelopeResult): Financials {
  return { jarEnvelope: env } as unknown as Financials;
}

describe("HuOverviewRow", () => {
  it("renders the 'Chờ phân bổ' card with amount + exact GD count", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    expect(screen.getByText("Chờ phân bổ")).toBeInTheDocument();
    expect(screen.getByText("2 GD chưa vào hũ")).toBeInTheDocument();
  });

  it("renders a jar card with 'ĐANG DÙNG' badge and 'còn lại trong hũ' when funded", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    expect(screen.getByText("Ăn uống & Đi chợ")).toBeInTheDocument();
    expect(screen.getByText("Đang dùng")).toBeInTheDocument();
    expect(screen.getByText("còn lại trong hũ")).toBeInTheDocument();
  });

  it("shows 'Chưa có số dư' for an unfunded jar, never a fabricated 0 (invariant #6)", () => {
    const env = envelope({ jars: [line({ jarId: "home", label: "Nhà cửa & Tiện ích", funded: null, remaining: null, inUse: false, source: "mock" })] });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
  });

  it("labels a negative remaining as 'đã vượt hũ' (overspent)", () => {
    const env = envelope({ jars: [line({ funded: 1_000_000, spent: 1_500_000, remaining: -500_000 })] });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("đã vượt hũ")).toBeInTheDocument();
  });

  it("hides the pending card once everything is allocated (known amount, 0 outstanding)", () => {
    const env = envelope({ pending: { amount: 0, unallocatedCount: 0, unallocatedTxnIds: [], perTxn: [], meta } });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
  });

  it("opens the allocation sheet when 'Chia ngay' is clicked", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    fireEvent.click(screen.getByRole("button", { name: /Chia ngay/ }));
    expect(screen.getByText("Chia thu nhập vào hũ")).toBeInTheDocument();
  });

  it("renders nothing when there are no jars configured", () => {
    const { container } = render(<HuOverviewRow financials={withEnvelope(envelope({ jars: [] }))} />);
    expect(container).toBeEmptyDOMElement();
  });
});
