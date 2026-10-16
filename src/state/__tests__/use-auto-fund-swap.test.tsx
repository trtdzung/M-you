import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Account, JarConfig } from "@/domain/models";
import { account, installFetchMock, db, rebalancesFor, spend, useHarness, wrapper } from "./auto-fund-harness";

/**
 * "Đổi nguồn" (changeSource / swapOptions) edge fixes, against the REAL hook +
 * REAL ManualTxnsProvider (fetch-mocked):
 *  - S3/G26: a `goal` donor is refused without an explicit `confirmGoal`.
 *  - G27: donors the engine wouldn't accept (no limit, the target itself) are refused.
 *  - G31: the alternatives list is computed from the TRIGGER month, not "now".
 */

const h = vi.hoisted(() => ({ jarConfig: { version: 3, jars: [] } as JarConfig, accounts: [] as Account[] }));

vi.mock("@/state/jars", () => ({ useJarConfig: () => ({ config: h.jarConfig, loaded: true }) }));
vi.mock("@/state/useFinancials", async () => {
  const manual = await import("../manual-txns");
  return {
    useFinancials: () => ({ transactions: manual.useManualTxns().manualTxns, raw: { accounts: h.accounts } }),
  };
});

const SEP = "2026-09-05T10:00:00.000Z";

beforeEach(() => {
  db.clear();
  window.localStorage.clear();
  installFetchMock();
  h.jarConfig = {
    version: 3,
    jars: [
      { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
      { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 1_000_000, role: "buffer" },
      { id: "health", label: "Sức khỏe", categoryIds: ["health-cat"], budgetLimit: 1_000_000, role: "goal" },
      { id: "free", label: "Không hạn mức", categoryIds: ["free-cat"], role: "spending" },
    ],
  };
  h.accounts = [account("cur", 2_000_000)]; // buf 1M + health 1M → pool 0
});

/** Book a 4.5M spend in food (500k over) and auto-fund it from buf. */
function fundedTrigger(result: { current: ReturnType<typeof useHarness> }) {
  let triggerId = "";
  let ids: string[] = [];
  act(() => {
    triggerId = result.current.addTxn(spend(4_500_000, "dining"));
  });
  act(() => {
    ids = result.current.fundJar({ targetJarId: "food", triggerTxnId: triggerId, postedAt: SEP, origin: "auto" }).createdIds;
  });
  return { triggerId, ids };
}

describe("changeSource — S3/G26: a goal jar is never charged without an explicit confirm", () => {
  it("refuses a goal donor (needs-goal, old leg intact), then swaps once confirmGoal is true", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    const { triggerId, ids } = fundedTrigger(result);
    expect(rebalancesFor(result.current.manualTxns, triggerId)[0].rebalance).toMatchObject({ fromJarId: "buf" });

    let r: ReturnType<typeof result.current.changeSource> | undefined;
    act(() => {
      r = result.current.changeSource({ triggerTxnId: triggerId, targetJarId: "food", postedAt: SEP, oldIds: ids, donorJarId: "health" });
    });
    expect(r?.status).toBe("needs-goal");
    expect(r?.ids).toEqual(ids);
    const kept = rebalancesFor(result.current.manualTxns, triggerId);
    expect(kept).toHaveLength(1);
    expect(kept[0].rebalance).toMatchObject({ fromJarId: "buf" });

    act(() => {
      r = result.current.changeSource({ triggerTxnId: triggerId, targetJarId: "food", postedAt: SEP, oldIds: ids, donorJarId: "health", confirmGoal: true });
    });
    expect(r?.status).toBe("swapped");
    expect(r?.donor).toEqual({ jarId: "health", label: "Hũ Sức khỏe", take: 500_000 });
    const swapped = rebalancesFor(result.current.manualTxns, triggerId);
    expect(swapped).toHaveLength(1);
    expect(swapped[0]).toMatchObject({ amount: 500_000 });
    expect(swapped[0].rebalance).toMatchObject({ fromJarId: "health", toJarId: "food", origin: "manual" });
  });
});

describe("changeSource — G27: same donor eligibility as the engine", () => {
  it("refuses a jar with no limit (spendable null) and the target jar itself", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    const { triggerId, ids } = fundedTrigger(result);
    for (const donorJarId of ["free", "food", "ghost"]) {
      let r: ReturnType<typeof result.current.changeSource> | undefined;
      act(() => {
        r = result.current.changeSource({ triggerTxnId: triggerId, targetJarId: "food", postedAt: SEP, oldIds: ids, donorJarId });
      });
      expect(r?.status).toBe("ineligible");
      expect(r?.ids).toEqual(ids);
    }
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(1);
  });
});

describe("swapOptions — G31: alternatives come from the trigger month, flagged goal jars included", () => {
  it("lists donors by the AUGUST snapshot for an August trigger, even though September drained them", () => {
    h.jarConfig.jars.push({ id: "ess", label: "Thiết yếu", categoryIds: ["housing"], budgetLimit: 5_000_000, role: "essential" });
    h.accounts = [account("cur", 7_000_000)];
    const { result } = renderHook(() => useHarness(), { wrapper });
    const AUG = "2026-08-20T10:00:00.000Z";
    let augTrigger = "";
    let ids: string[] = [];
    act(() => {
      result.current.addTxn(spend(4_900_000, "housing", SEP)); // drains ess in SEPTEMBER only
      augTrigger = result.current.addTxn(spend(4_500_000, "dining", AUG));
    });
    act(() => {
      ids = result.current.fundJar({ targetJarId: "food", triggerTxnId: augTrigger, postedAt: AUG, origin: "auto" }).createdIds;
    });
    expect(ids).toHaveLength(1);

    const { shortfall, options } = result.current.swapOptions({ triggerTxnId: augTrigger, targetJarId: "food", postedAt: AUG, oldIds: ids });
    expect(shortfall).toBe(500_000);
    // ess has 5M in August (only 100k in September) — it must be offered.
    expect(options.find((o) => o.jarId === "ess")).toMatchObject({ spendable: 5_000_000, isGoal: false });
    // the goal jar is offered but flagged; the no-limit jar and the target never are.
    expect(options.find((o) => o.jarId === "health")).toMatchObject({ isGoal: true });
    expect(options.some((o) => o.jarId === "free" || o.jarId === "food")).toBe(false);

    let r: ReturnType<typeof result.current.changeSource> | undefined;
    act(() => {
      r = result.current.changeSource({ triggerTxnId: augTrigger, targetJarId: "food", postedAt: AUG, oldIds: ids, donorJarId: "ess" });
    });
    expect(r?.status).toBe("swapped"); // the offered option is exactly what changeSource accepts
  });
});
