import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import type { Account, JarConfig } from "@/domain/models";
import type { FundResult } from "@/state/use-auto-fund";
import { account, allRebalances, db, installFetchMock, spend, useHarness, wrapper } from "@/state/__tests__/auto-fund-harness";
import { AutoFundResultBanner } from "../AutoFundResultBanner";

/**
 * The post-fund banner against the REAL `useAutoFund` + REAL ManualTxnsProvider
 * (fetch-mocked; jars/useFinancials mocked to a static config + the live store),
 * so the headline is proven to name the donor the ENGINE actually charged.
 *
 * The banner is READ-ONLY: the old [Hoàn tác] / [Đổi nguồn] pair was removed
 * together with the whole undo/swap mechanic, so the second test guards that no
 * action ever creeps back onto it.
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
  return <AutoFundResultBanner targetLabel={fund.targetLabel} donors={fund.donors} />;
}

beforeEach(() => {
  db.clear();
  window.localStorage.clear();
  installFetchMock();
  h.jarConfig = {
    version: 3,
    jars: [
      { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000 },
      { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 1_000_000 },
      { id: "fun", label: "Hưởng thụ", categoryIds: ["fun-cat"], budgetLimit: 1_000_000 },
      { id: "health", label: "Sức khỏe", categoryIds: ["health-cat"], budgetLimit: 1_000_000 },
    ],
  };
  h.accounts = [account("cur", 3_000_000)]; // buf + fun + health → pool 0
});

describe("AutoFundResultBanner", () => {
  it("names the donor the engine actually charged, with the amount it moved", async () => {
    render(<Scenario />, { wrapper });
    expect(await screen.findByText(/từ Hũ Dự phòng → Ăn uống/)).toBeInTheDocument();
    expect(screen.getByText("500.000 ₫")).toBeInTheDocument();
    expect(store.rebalances).toHaveLength(1);
    expect(store.rebalances[0].rebalance).toMatchObject({ fromJarId: "buf", toJarId: "food" });
  });

  it("is read-only — it offers no Hoàn tác / Đổi nguồn (or any other) action", async () => {
    render(<Scenario />, { wrapper });
    const banner = await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: /Hoàn tác/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Đổi nguồn/ })).not.toBeInTheDocument();
    expect(banner.querySelectorAll("button")).toHaveLength(0);
  });
});
