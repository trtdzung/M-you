import { afterEach, describe, expect, it, vi } from "vitest";
import { type RenderOptions, render as rtlRender, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { StubCategoryTaxonomy } from "@/test-utils/category-taxonomy-stub";
import type { Financials } from "@/domain/engine/finance-compose";
import type { JarEnvelopeResult, JarEnvelopeLine } from "@/domain/engine/jar-envelope";
import type { JarConfig } from "@/domain/models";
import { monthPeriod } from "@/domain/engine/types";
import { currentMonthKey } from "@/lib/demo-clock";

const JUNE = monthPeriod(2026, 5);

// Jar config comes from client state; stub it so the row is pure presentation.
const config: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống & Đi chợ", categoryIds: ["dining"], color: "#f26522", icon: "food" },
    { id: "home", label: "Nhà cửa & Tiện ích", categoryIds: ["utilities"], color: "#0e7490", icon: "home" },
  ],
};
// The sheet (opened by "Chia ngay") reads config + the atomic `postLedger` writer.
// `jarError` mirrors `useJarConfig().error` (non-null when GET /api/jars failed, U10).
let jarError: string | null = null;
vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config, error: jarError, postLedger: vi.fn().mockResolvedValue(true), mutationError: null }),
}));
// The labeling sheet reads the corrections hooks — stub them so the row is pure.
vi.mock("@/state/corrections", () => ({
  useConfirmCategory: () => vi.fn(),
  useCorrections: () => ({ unsaved: false }),
}));
// The labeling sheet also consults auto-fund on label; stub to a no-op "covered"
// so this row test needs no PersonaProvider/financials wiring.
vi.mock("@/state/use-auto-fund", () => ({
  useAutoFund: () => ({ reconcile: () => ({ status: "covered", donors: [], targetLabel: "hũ" }) }),
}));
// The labeling sheet flips a transfer's type via the manual-txn store; stub it so
// the row stays free of the ManualTxnsProvider.
vi.mock("@/state/manual-txns", () => ({
  useManualTxns: () => ({ update: vi.fn(() => true) }),
}));

import { HuOverviewRow } from "../HuOverviewRow";


/**
 * Every render goes through `StubCategoryTaxonomy`: the components below read
 * the persona's taxonomy via `useCategories()` but own none of it, so they get
 * an already-loaded preset taxonomy instead of the real fetching provider (the
 * provider itself is covered by its own tests).
 */
const render = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  rtlRender(ui, { ...options, wrapper: StubCategoryTaxonomy });

function line(over: Partial<JarEnvelopeLine>): JarEnvelopeLine {
  return {
    jarId: "food", label: "Ăn uống & Đi chợ", limit: 3_000_000, spent: 500_000,
    balance: 2_500_000, overLimit: false, inUse: true, source: "self_reported", freshness: null, ...over,
  };
}

const meta = { period: JUNE, sourceCoverage: { sources: ["mock" as const], knownCount: 1, unknownCount: 0 }, freshness: null };

function envelope(over: Partial<JarEnvelopeResult>): JarEnvelopeResult {
  return {
    pending: { amount: 5_000_000, overAllocated: false, pool: 5_000_000, allocated: 0, meta },
    jars: [line({})],
    meta,
    ...over,
  };
}

function withEnvelope(env: JarEnvelopeResult, overAllocated = false, monthKey = currentMonthKey()): Financials {
  return {
    monthKey,
    jarEnvelope: env,
    unallocatedPool: { amount: overAllocated ? -1 : 0, overAllocated, source: "mock" },
  } as unknown as Financials;
}

describe("HuOverviewRow", () => {
  afterEach(() => {
    jarError = null;
  });

  it("U10: a failed jar load renders an error state — no jar/pending cards, no 'all CASA unallocated'", () => {
    jarError = "Failed to load jars";
    render(<HuOverviewRow financials={withEnvelope(envelope({ jars: [] }))} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Không tải được hũ chi tiêu")).toBeInTheDocument();
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
  });

  it("D26/U14: hides the pending card when the unallocated pool is negative (over-allocated)", () => {
    const env = envelope({ pending: { amount: -2_000_000, overAllocated: true, pool: 5_000_000, allocated: 7_000_000, meta } });
    render(<HuOverviewRow financials={withEnvelope(env, true)} />);
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
    expect(screen.getByText("Vượt phân bổ")).toBeInTheDocument();
  });

  it("the pending card shows the allocation headroom (pool − Σ hạn mức), i.e. the sheet's 'Còn lại để chia'", () => {
    // NOT the picker's spendable-lens pool (which, after spend, is larger) — the
    // card is the CTA into the sheet, so it must show what the sheet accepts.
    const env = envelope({ pending: { amount: 5_000_000, overAllocated: false, pool: 8_000_000, allocated: 3_000_000, meta } });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("5 tr")).toBeInTheDocument();
    expect(screen.getByText("số dư chưa đặt vào hũ nào")).toBeInTheDocument();
  });
  it("renders the 'Chờ phân bổ' card with the pending amount", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    expect(screen.getByText("Chờ phân bổ")).toBeInTheDocument();
  });

  it("renders a jar card with SỐ DƯ and the separate 'Đã chi / hạn mức' gauge", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    expect(screen.getByText("Ăn uống & Đi chợ")).toBeInTheDocument();
    expect(screen.getByText("Số dư")).toBeInTheDocument();
    expect(screen.getByText("2,5 tr")).toBeInTheDocument();
    expect(screen.getByText("Đã chi 500K / 3 tr hạn mức")).toBeInTheDocument();
  });

  it("a jar without a limit still shows its balance and 'Chưa đặt hạn mức'", () => {
    const env = envelope({ jars: [line({ limit: null, spent: 200_000, balance: 1_000_000 })] });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("1 tr")).toBeInTheDocument();
    expect(screen.getByText("Đã chi 200K · Chưa đặt hạn mức")).toBeInTheDocument();
  });

  it("shows 'Chưa có số dư' for an unfunded jar (balance null), never a fabricated 0 (invariant #6)", () => {
    const env = envelope({
      jars: [
        line({
          jarId: "home",
          label: "Nhà cửa & Tiện ích",
          limit: null,
          balance: null,
          inUse: false,
          source: "mock",
        }),
      ],
    });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
  });

  it("renders the running balance of a funded jar", () => {
    const env = envelope({
      jars: [
        line({
          jarId: "home",
          label: "Nhà cửa & Tiện ích",
          limit: 2_000_000,
          spent: 500_000,
          balance: 1_500_000,
          source: "self_reported",
        }),
      ],
    });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.queryByText("Chưa có số dư")).not.toBeInTheDocument();
    expect(screen.getByText("1,5 tr")).toBeInTheDocument();
  });

  it("shows a negative balance as such (hết tiền) in text-negative — no floor at 0", () => {
    const env = envelope({ jars: [line({ limit: 1_000_000, spent: 1_500_000, balance: -500_000, overLimit: true })] });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    const negative = screen.getByText("-500K");
    expect(negative).toHaveClass("text-negative");
    expect(screen.queryByText("0 ₫")).not.toBeInTheDocument();
    // The limit axis is independent of the balance axis.
    expect(screen.getByText("Đã chi 1,5 tr / 1 tr hạn mức")).toBeInTheDocument();
  });

  it("Case A: limit 7tr, deposited 7tr, spent 3tr → Số dư 4 tr, 'Đã chi 3 tr / 7 tr hạn mức'", () => {
    const env = envelope({ jars: [line({ limit: 7_000_000, spent: 3_000_000, balance: 4_000_000 })] });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("4 tr")).toBeInTheDocument();
    expect(screen.getByText("Đã chi 3 tr / 7 tr hạn mức")).toBeInTheDocument();
  });

  it("Red Team #2: a past month hides 'Chờ phân bổ' (a current stock) but keeps the jar figures", () => {
    const env = envelope({
      jars: [line({}), line({ jarId: "home", label: "Nhà cửa & Tiện ích", limit: 2_000_000, spent: 300_000, balance: null })],
    });
    render(<HuOverviewRow financials={withEnvelope(env, false, "2026-01")} />);
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chia ngay/ })).not.toBeInTheDocument();
    // Pre-anchor month: no balance yet, but Đã chi / hạn mức stay visible.
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
    expect(screen.getByText("Đã chi 300K / 2 tr hạn mức")).toBeInTheDocument();
    expect(screen.getByText("Đã chi 500K / 3 tr hạn mức")).toBeInTheDocument();
  });

  it("opens the real jar view (Ngân sách) when a jar card is tapped", () => {
    const onNavigate = vi.fn();
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Hũ Ăn uống & Đi chợ/ }));
    expect(onNavigate).toHaveBeenCalledWith("budget");
  });

  it("hides the pending card once everything is allocated (known amount, 0 outstanding)", () => {
    const env = envelope({ pending: { amount: 0, overAllocated: false, pool: 5_000_000, allocated: 5_000_000, meta } });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
  });

  it("shows the pending card when the pool is unknown (no CASA account)", () => {
    const env = envelope({ pending: { amount: "unknown", overAllocated: false, pool: "unknown", allocated: 0, meta } });
    render(<HuOverviewRow financials={withEnvelope(env)} />);
    expect(screen.getByText("Chờ phân bổ")).toBeInTheDocument();
  });

  it("opens the allocation sheet when 'Chia ngay' is clicked", () => {
    render(<HuOverviewRow financials={withEnvelope(envelope({}))} />);
    fireEvent.click(screen.getByRole("button", { name: /Chia ngay/ }));
    expect(screen.getByText("Chia tiền vào hũ")).toBeInTheDocument();
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

  // --- "Chưa gắn nhãn" card (unlabeled spend) ---

  function withUnlabeled(count: number, amount: number, jars = [line({})]): Financials {
    return {
      monthKey: currentMonthKey(),
      jarEnvelope: envelope({ jars }),
      unallocatedPool: { amount: 0, overAllocated: false, source: "mock" },
      unlabeled: { count, amount, source: "mock" },
    } as unknown as Financials;
  }

  it("renders the 'Chưa gắn nhãn' card with count + compact amount when count > 0", () => {
    render(<HuOverviewRow financials={withUnlabeled(3, 1_200_000)} />);
    expect(screen.getByText("Chưa gắn nhãn")).toBeInTheDocument();
    expect(screen.getByText("3 giao dịch chưa vào hũ")).toBeInTheDocument();
    expect(screen.getByText("1,2 tr")).toBeInTheDocument();
  });

  it("always shows the 'Chưa gắn nhãn' card at count 0 with an 'Đã gắn nhãn hết' empty state", () => {
    render(<HuOverviewRow financials={withUnlabeled(0, 0)} />);
    expect(screen.getByText("Chưa gắn nhãn")).toBeInTheDocument();
    expect(screen.getByText("Đã gắn nhãn hết")).toBeInTheDocument();
    // Nothing to label → the CTA is disabled, not a live sheet trigger.
    expect(screen.getByRole("button", { name: /Gắn nhãn/ })).toBeDisabled();
  });

  it("[RT#11] shows the card even with NO jars when unlabeled spend exists", () => {
    render(<HuOverviewRow financials={withUnlabeled(2, 500_000, [])} />);
    expect(screen.getByText("Chưa gắn nhãn")).toBeInTheDocument();
    // No jars → no pending card, but the section still renders the label card.
    expect(screen.queryByText("Chờ phân bổ")).not.toBeInTheDocument();
  });

  it("opens the labeling sheet when the card CTA is clicked", () => {
    render(<HuOverviewRow financials={withUnlabeled(2, 500_000)} unlabeledItems={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Gắn nhãn/ }));
    expect(screen.getByText("Gắn nhãn chi tiêu")).toBeInTheDocument();
  });
});
