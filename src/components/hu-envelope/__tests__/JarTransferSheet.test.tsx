import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JarBudgetLine } from "@/domain/engine/jar-budget-types";
import { jarSpendable, type TransferSnapshot } from "@/domain/engine";
import type { RawData } from "@/domain/engine/finance-compose";
import type { JarConfig } from "@/domain/models";

/**
 * `JarTransferSheet` — the "Chuyển giữa các hũ" balance transfer sheet opened
 * from a jar card (plan 260923-jar-to-jar-transfer-sheet). `useJarConfig` and
 * `useAutoFundWith` are stubbed so the sheet's pure UI logic (endpoint pick,
 * cap/validation, confirm/reject) is exercised against a deterministic
 * snapshot — `jar-transfer-rules.test.ts` already pins the pure rules
 * (`transferEndpoints`/`validateTransfer`/`previewTransfer`) this sheet calls.
 */

const config: JarConfig = {
  version: 3,
  jars: [
    { id: "food", label: "Ăn uống", categoryIds: ["dining"], icon: "food" },
    { id: "home", label: "Nhà cửa", categoryIds: ["utilities"], icon: "home" },
    { id: "gift", label: "Quà tặng", categoryIds: ["gift"], icon: "gift" },
  ],
};
vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config }) }));

const h = vi.hoisted(() => ({
  snapshot: null as unknown,
  commitPersisted: vi.fn(),
}));
vi.mock("@/state/use-auto-fund", () => ({
  useAutoFundWith: () => ({ snapshotAt: () => h.snapshot, commitPersisted: h.commitPersisted }),
}));

import { JarTransferSheet } from "../JarTransferSheet";

function jarLine(huId: string, label: string, balance: number | null): JarBudgetLine {
  return {
    huId,
    label,
    categoryIds: [],
    spent: 0,
    prevSpent: 0,
    momDelta: 0,
    momPct: null,
    limit: null,
    limitState: "unset",
    rebalanceNet: 0,
    balance,
    pct: null,
    status: null,
    thresholdHit: false,
    source: "mock",
    freshness: null,
  };
}

/** `jars` as `[id, label, balance]`; spendables derived the same way `snapshotForDate` does. */
function snapshotOf(casaBalance: number, jars: [string, string, number | null][]): TransferSnapshot {
  const lines = jars.map(([id, label, balance]) => jarLine(id, label, balance));
  return {
    casaBalance,
    lines,
    spendables: lines.map((l) => ({ id: l.huId, label: l.label, categoryIds: [], spendable: jarSpendable(l.balance) })),
  };
}

const RAW = {} as unknown as RawData;

const onClose = vi.fn();
const onDone = vi.fn();

function renderSheet(initialFromId = "food") {
  return render(
    <JarTransferSheet initialFromId={initialFromId} transactions={[]} raw={RAW} onClose={onClose} onDone={onDone} />,
  );
}

beforeEach(() => {
  onClose.mockClear();
  onDone.mockClear();
  h.commitPersisted = vi.fn().mockResolvedValue(["tx-1"]);
  // food 2M, home 500K both known; gift unfunded (null) — pool = 10M − 2.5M = 7.5M.
  h.snapshot = snapshotOf(10_000_000, [
    ["food", "Ăn uống", 2_000_000],
    ["home", "Nhà cửa", 500_000],
    ["gift", "Quà tặng", null],
  ]);
});

describe("JarTransferSheet — loading & empty states", () => {
  it("shows a loading message while raw hasn't loaded yet (never renders the form)", () => {
    render(<JarTransferSheet initialFromId="food" transactions={[]} raw={null} onClose={onClose} onDone={onDone} />);
    expect(screen.getByText("Đang tải số dư các hũ…")).toBeInTheDocument();
    expect(screen.queryByText("Từ hũ")).not.toBeInTheDocument();
  });

  it("shows the 'need ≥ 2 known-balance endpoints' empty state and a working Đóng button", () => {
    // Pool is always a known endpoint (a number, never null); one unfunded jar → only 1 known.
    h.snapshot = snapshotOf(0, [["food", "Ăn uống", null]]);
    renderSheet();
    expect(screen.getByText("Cần ít nhất 2 hũ có số dư để chuyển.")).toBeInTheDocument();
    // The Sheet's own backdrop/X close buttons share the "Đóng" accessible name
    // (Sheet's default `closeLabel`) — the empty state's own CTA is the last one.
    const closeButtons = screen.getAllByRole("button", { name: "Đóng" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("JarTransferSheet — endpoint selection", () => {
  it("defaults the source to initialFromId and lets the user pick a destination via the picker", () => {
    renderSheet("food");
    expect(screen.getByRole("button", { name: "Hũ chuyển: Ăn uống — đổi" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    expect(screen.getByText("Chọn hũ nhận")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nhà cửa/ }));
    expect(screen.getByRole("button", { name: "Hũ nhận: Nhà cửa — đổi" })).toBeInTheDocument();
  });

  it("swap flips from/to and keeps the amount", () => {
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    fireEvent.click(screen.getByRole("button", { name: /Nhà cửa/ }));
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "300000" } });

    fireEvent.click(screen.getByRole("button", { name: "Đảo chiều chuyển" }));

    expect(screen.getByRole("button", { name: "Hũ chuyển: Nhà cửa — đổi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hũ nhận: Ăn uống — đổi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Số tiền")).toHaveValue("300.000");
  });

  it("shows an unfunded jar disabled in the picker with 'Chưa có số dư'", () => {
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    expect(screen.getByRole("button", { name: /Quà tặng/ })).toBeDisabled();
    expect(screen.getByText("Chưa có số dư")).toBeInTheDocument();
  });

  it("an over-allocated pool cannot be picked as a source (cap 0, 'Không còn số dư để chuyển')", () => {
    // food 2M + home 500K = 2.5M claimed > 2M CASA → pool balance −500K, cap 0.
    h.snapshot = snapshotOf(2_000_000, [
      ["food", "Ăn uống", 2_000_000],
      ["home", "Nhà cửa", 500_000],
    ]);
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Hũ chuyển: Ăn uống — đổi" })); // open the "from" picker
    expect(screen.getByRole("button", { name: /Chưa phân bổ/ })).toBeDisabled();
    expect(screen.getByText("Không còn số dư để chuyển")).toBeInTheDocument();
  });
});

describe("JarTransferSheet — amount validation", () => {
  it("shows an inline cap error and disables confirm over cap; 'Tối đa' fills an odd-amount cap exactly", () => {
    h.snapshot = snapshotOf(10_000_000, [
      ["food", "Ăn uống", 123_457],
      ["home", "Nhà cửa", 500_000],
    ]);
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    fireEvent.click(screen.getByRole("button", { name: /Nhà cửa/ }));

    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "200000" } });
    fireEvent.blur(screen.getByLabelText("Số tiền"));
    expect(screen.getByText("Tối đa 123.457 ₫.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Chuyển/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Tối đa" }));
    expect(screen.getByLabelText("Số tiền")).toHaveValue("123.457");
    expect(screen.queryByText("Tối đa 123.457 ₫.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyển 123.457 ₫" })).toBeEnabled();
  });
});

describe("JarTransferSheet — confirm", () => {
  it("jar→jar: commitPersisted gets the right donor/target and onDone reports the summary", async () => {
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    fireEvent.click(screen.getByRole("button", { name: /Nhà cửa/ }));
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("button", { name: "Chuyển 300.000 ₫" }));

    await waitFor(() => expect(h.commitPersisted).toHaveBeenCalledTimes(1));
    const call = h.commitPersisted.mock.calls[0][0];
    expect(call.targetJarId).toBe("home");
    expect(call.origin).toBe("manual");
    expect(call.triggerTxnId).toMatch(/^jar-transfer-\d+$/);
    expect(call.assessment).toMatchObject({
      tier: "topup",
      shortfall: 300_000,
      donors: [{ jarId: "food", label: "Ăn uống", take: 300_000 }],
      targetJarId: "home",
      source: "mock",
    });

    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ amount: 300_000, fromLabel: "Ăn uống", toLabel: "Nhà cửa" }),
    );
  });

  it("jar→pool: targetJarId is null", async () => {
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    fireEvent.click(screen.getByRole("button", { name: /Chưa phân bổ/ }));
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Chuyển 500.000 ₫" }));

    await waitFor(() => expect(h.commitPersisted).toHaveBeenCalledTimes(1));
    expect(h.commitPersisted.mock.calls[0][0].targetJarId).toBeNull();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ amount: 500_000, fromLabel: "Ăn uống", toLabel: "Chưa phân bổ" }));
  });

  it("two synchronous clicks on confirm call commitPersisted exactly once (inFlight guard)", () => {
    let resolveCommit: (ids: string[]) => void = () => {};
    h.commitPersisted = vi.fn(() => new Promise<string[]>((resolve) => { resolveCommit = resolve; }));
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    fireEvent.click(screen.getByRole("button", { name: /Nhà cửa/ }));
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "300000" } });
    const confirmBtn = screen.getByRole("button", { name: "Chuyển 300.000 ₫" });

    // Both clicks dispatched inside one `act` so React can't flush the
    // `saving`-disabled re-render between them — this exercises the
    // synchronous `inFlight` ref, not merely the `disabled` attribute.
    act(() => {
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);
    });

    expect(h.commitPersisted).toHaveBeenCalledTimes(1);
    resolveCommit(["tx-1"]);
  });

  it("keeps the form and shows an alert when commitPersisted rejects, re-enabling confirm", async () => {
    h.commitPersisted = vi.fn().mockRejectedValue(new Error("boom"));
    renderSheet("food");
    fireEvent.click(screen.getByRole("button", { name: "Chọn hũ nhận" }));
    fireEvent.click(screen.getByRole("button", { name: /Nhà cửa/ }));
    fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("button", { name: "Chuyển 300.000 ₫" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Không ghi được thay đổi. Vui lòng thử lại."),
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Số tiền")).toHaveValue("300.000");
    expect(screen.getByRole("button", { name: "Chuyển 300.000 ₫" })).toBeEnabled();
  });
});
