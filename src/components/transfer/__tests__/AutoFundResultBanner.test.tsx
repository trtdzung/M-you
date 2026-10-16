import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import type { Account, JarConfig } from "@/domain/models";
import type { FundResult } from "@/state/use-auto-fund";
import { account, allRebalances, db, installFetchMock, spend, useHarness, wrapper } from "@/state/__tests__/auto-fund-harness";
import { AutoFundResultBanner } from "../AutoFundResultBanner";

/**
 * The post-fund banner against the REAL `useAutoFund` + REAL ManualTxnsProvider
 * (fetch-mocked; jars/useFinancials mocked to a static config + the live store):
 *  - U23: after "Đổi nguồn" the headline names the NEW donor.
 *  - S3/G26: a goal jar needs an explicit confirm step before it is charged.
 *  - G22/U12: "Hoàn tác" tells the user what happened instead of vanishing.
 */

const h = vi.hoisted(() => ({ jarConfig: { version: 3, jars: [] } as JarConfig, accounts: [] as Account[] }));

vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config: h.jarConfig, loaded: true }) }));
vi.mock("@/state/useFinancials", async () => {
  const manual = await import("@/state/manual-txns");
  return {
    useFinancials: () => ({ transactions: manual.useManualTxns().manualTxns, raw: { accounts: h.accounts } }),
  };
});

const SEP = "2026-09-05T10:00:00.000Z";
const store = { rebalances: [] as ReturnType<typeof allRebalances> };

/** Books a 4.5M food spend (500k over), auto-funds it, then renders the banner. */
function Scenario() {
  const harness = useHarness();
  const [trigger, setTrigger] = useState<string | null>(null);
  const [fund, setFund] = useState<FundResult | null>(null);
  const started = useRef(false);
  store.rebalances = allRebalances(harness.manualTxns);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setTrigger(harness.addTxn(spend(4_500_000, "dining")));
  }, [harness]);
  // Fund once the trigger is in the rendered txn view (like the real success screen).
  useEffect(() => {
    if (!trigger || fund || !harness.manualTxns.some((t) => t.id === trigger)) return;
    setFund(harness.fundJar({ targetJarId: "food", triggerTxnId: trigger, postedAt: SEP, origin: "auto" }));
  }, [harness, trigger, fund]);
  if (!fund) return null;
  return (
    <AutoFundResultBanner
      triggerTxnId={trigger!}
      targetJarId={fund.targetJarId}
      targetLabel={fund.targetLabel}
      postedAt={fund.postedAt}
      donors={fund.donors}
      createdIds={fund.createdIds}
    />
  );
}

beforeEach(() => {
  db.clear();
  window.localStorage.clear();
  installFetchMock();
  h.jarConfig = {
    version: 3,
    jars: [
      { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
      { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 1_000_000, role: "buffer" },
      { id: "fun", label: "Hưởng thụ", categoryIds: ["fun-cat"], budgetLimit: 1_000_000, role: "spending" },
      { id: "health", label: "Sức khỏe", categoryIds: ["health-cat"], budgetLimit: 1_000_000, role: "goal" },
    ],
  };
  h.accounts = [account("cur", 3_000_000)]; // buf + fun + health → pool 0
});

async function renderFunded() {
  render(<Scenario />, { wrapper });
  expect(await screen.findByText(/từ Hũ Dự phòng → Ăn uống/)).toBeInTheDocument();
}

describe("AutoFundResultBanner", () => {
  it("U23: after Đổi nguồn the headline names the new donor, not the old one", async () => {
    await renderFunded();
    fireEvent.click(screen.getByRole("button", { name: /Đổi nguồn/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Hũ Hưởng thụ/ }));
    expect(await screen.findByText(/từ Hũ Hưởng thụ → Ăn uống/)).toBeInTheDocument();
    expect(screen.queryByText(/từ Hũ Dự phòng/)).not.toBeInTheDocument();
    expect(store.rebalances).toHaveLength(1);
    expect(store.rebalances[0].rebalance).toMatchObject({ fromJarId: "fun" });
  });

  it("S3/G26: a goal jar opens a confirm step; nothing is charged until 'Xác nhận rút'", async () => {
    await renderFunded();
    fireEvent.click(screen.getByRole("button", { name: /Đổi nguồn/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /Hũ Sức khỏe/ }));
    expect(within(sheet).getByRole("alertdialog", { name: "Xác nhận rút hũ Mục tiêu" })).toBeInTheDocument();
    expect(store.rebalances[0].rebalance).toMatchObject({ fromJarId: "buf" }); // untouched so far

    // Cancel returns to the list without charging.
    fireEvent.click(within(sheet).getByRole("button", { name: "Huỷ" }));
    expect(store.rebalances[0].rebalance).toMatchObject({ fromJarId: "buf" });

    fireEvent.click(within(sheet).getByRole("button", { name: /Hũ Sức khỏe/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Xác nhận rút" }));
    expect(await screen.findByText(/từ Hũ Sức khỏe → Ăn uống/)).toBeInTheDocument();
    expect(store.rebalances).toHaveLength(1);
    expect(store.rebalances[0].rebalance).toMatchObject({ fromJarId: "health", origin: "manual" });
  });

  it("G22/U12: Hoàn tác that re-applies a cover SAYS so and stays visible", async () => {
    await renderFunded();
    fireEvent.click(screen.getByRole("button", { name: /Hoàn tác/ }));
    expect(await screen.findByText(/Đã hoàn tác — tự bù lại từ Hũ Dự phòng 500\.000/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hoàn tác/ })).not.toBeInTheDocument();
    await waitFor(() => expect(store.rebalances).toHaveLength(1));
  });
});
