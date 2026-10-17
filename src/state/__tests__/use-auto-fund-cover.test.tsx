import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Account, JarConfig } from "@/domain/models";
import { account, allRebalances, db, installFetchMock, net, rebalancesFor, spend, useHarness, wrapper } from "./auto-fund-harness";

/**
 * Cover-sizing edge fixes for `useAutoFund`, against the REAL hook + REAL
 * ManualTxnsProvider (fetch-mocked):
 *  - U5: a trigger funds at most its OWN contribution; impossible full cover →
 *    partial non-goal cover + residual (never all-or-nothing).
 *  - G22/U12: undo reports what it re-applied / what's left.
 *  - S7/U4: `reconcileLabels` batches background labels without double-funding.
 *  - H14/U1: `commitPersisted` rejects (and rolls back) when a leg isn't stored.
 */

const h = vi.hoisted(() => ({ jarConfig: { version: 3, jars: [] } as JarConfig, accounts: [] as Account[] }));

// The static config reads as MIGRATED (opening deposit = limit at the demo month
// start, like the seeded DB), memoised per config so its identity is stable.
vi.mock("@/state/jars", async () => {
  const { monthAnchor, withSeedDeposits } = await import("@/test-utils/jar-ledger-fixtures");
  const seeded = new WeakMap<JarConfig, JarConfig>();
  const migrated = (cfg: JarConfig) => {
    if (!seeded.has(cfg)) seeded.set(cfg, withSeedDeposits(cfg, monthAnchor("2026-09")));
    return seeded.get(cfg)!;
  };
  return { useJarConfig: () => ({ config: migrated(h.jarConfig), loaded: true }) };
});
vi.mock("@/state/useFinancials", async () => {
  const manual = await import("../manual-txns");
  return {
    useFinancials: () => ({ transactions: manual.useManualTxns().manualTxns, raw: { accounts: h.accounts } }),
  };
});

const SEP = "2026-09-05T10:00:00.000Z";
const food = { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], budgetLimit: 4_000_000 };
const buf = (limit: number) => ({ id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: limit });
const goal = { id: "goal", label: "Mục tiêu", categoryIds: ["goal-save"], budgetLimit: 5_000_000 };

beforeEach(() => {
  db.clear();
  net.failPosts = false;
  window.localStorage.clear();
  installFetchMock();
});

describe("U5 — a trigger funds only its own contribution; partial cover when full cover is impossible", () => {
  it("re-labelling within the same jar re-applies the trigger's cover despite OLDER uncovered debt", () => {
    h.jarConfig = { version: 3, jars: [food, buf(1_200_000)] };
    h.accounts = [account("cur", 1_200_000)]; // = buf → pool 0
    const { result } = renderHook(() => useHarness(), { wrapper });
    let trigger = "";
    act(() => {
      result.current.addTxn(spend(4_449_000, "dining", "2026-09-02T10:00:00.000Z")); // 449k older debt, never covered
      trigger = result.current.addTxn(spend(1_200_000, "dining"));
    });
    let first: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      first = result.current.fundJar({ targetJarId: "food", triggerTxnId: trigger, postedAt: SEP, origin: "auto" });
    });
    expect(first?.status).toBe("funded"); // capped at 1.2M (not the whole 1.649M overspend)
    expect(first?.donors).toEqual([{ jarId: "buf", label: "Hũ Dự phòng", take: 1_200_000 }]);

    // Nhà ở → Tiện ích style re-label: same jar, different category.
    let again: ReturnType<typeof result.current.reconcile> | undefined;
    act(() => {
      result.current.updateTxn(trigger, { categoryId: "groceries" });
      again = result.current.reconcile({ triggerTxnId: trigger, categoryId: "groceries", postedAt: SEP, origin: "manual", override: { categoryId: "groceries" } });
    });
    expect(again?.status).toBe("funded");
    const legs = rebalancesFor(result.current.manualTxns, trigger);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ amount: 1_200_000 });
  });

  it("commits a PARTIAL non-goal cover and reports the residual (status insufficient, ids created)", () => {
    h.jarConfig = { version: 3, jars: [food, buf(1_000_000)] };
    h.accounts = [account("cur", 1_000_000)];
    const { result } = renderHook(() => useHarness(), { wrapper });
    let trigger = "";
    act(() => {
      trigger = result.current.addTxn(spend(5_500_000, "dining")); // 1.5M over, only 1M reachable
    });
    let r: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      r = result.current.fundJar({ targetJarId: "food", triggerTxnId: trigger, postedAt: SEP, origin: "auto" });
    });
    expect(r?.status).toBe("insufficient");
    expect(r?.shortfall).toBe(500_000); // the residual still uncovered
    expect(r?.createdIds).toHaveLength(1);
    expect(rebalancesFor(result.current.manualTxns, trigger)[0]).toMatchObject({ amount: 1_000_000 });
  });

});

describe("S7/U4 — reconcileLabels funds background labels once, never double-funding within a batch", () => {
  it("two labels into one jar in the same tick: legs total the overspend exactly (2M), not 2M each", () => {
    h.jarConfig = { version: 3, jars: [food, buf(6_000_000)] };
    h.accounts = [account("cur", 6_000_000)];
    const { result } = renderHook(() => useHarness(), { wrapper });
    let a = "";
    let b = "";
    act(() => {
      a = result.current.addTxn(spend(3_000_000, "unclassified", "2026-09-03T10:00:00.000Z"));
      b = result.current.addTxn(spend(3_000_000, "unclassified", "2026-09-04T10:00:00.000Z"));
    });
    let results: ReturnType<typeof result.current.reconcileLabels> = [];
    act(() => {
      // Labels land as overrides (corrections not yet re-rendered).
      results = result.current.reconcileLabels([{ txnId: b, categoryId: "dining" }, { txnId: a, categoryId: "dining" }]);
    });
    const legs = allRebalances(result.current.manualTxns);
    expect(legs.reduce((s, t) => s + t.amount, 0)).toBe(2_000_000);
    expect(legs).toHaveLength(1);
    expect(legs[0].rebalance).toMatchObject({ triggerTxnId: a, fromJarId: "buf", toJarId: "food", origin: "auto" });
    expect(results.map((r) => r.status)).toEqual(["funded"]);
  });

});

describe("H14/U1 — commitPersisted awaits every leg", () => {
  const assessment = {
    tier: "topup" as const,
    shortfall: 500_000,
    donors: [{ jarId: "buf", label: "Hũ Dự phòng", take: 500_000 }],
    targetJarId: "food",
    source: "mock" as const,
  };

  it("resolves with the stored leg ids on success", async () => {
    h.jarConfig = { version: 3, jars: [food, buf(6_000_000)] };
    h.accounts = [account("cur", 6_000_000)];
    const { result } = renderHook(() => useHarness(), { wrapper });
    await waitFor(() => expect(result.current.manualTxns).toEqual([]));
    let ids: string[] = [];
    await act(async () => {
      ids = await result.current.commitPersisted({ assessment, targetJarId: "food", triggerTxnId: "t1", postedAt: SEP, origin: "auto" });
    });
    expect(ids).toHaveLength(1);
    expect(db.get("CIF_0001")?.map((t) => t.id)).toEqual(ids);
  });

  it("rejects and leaves no local leg when the server fails to store it", async () => {
    h.jarConfig = { version: 3, jars: [food, buf(6_000_000)] };
    h.accounts = [account("cur", 6_000_000)];
    const { result } = renderHook(() => useHarness(), { wrapper });
    await waitFor(() => expect(result.current.manualTxns).toEqual([]));
    net.failPosts = true;
    let error: unknown = null;
    await act(async () => {
      await result.current
        .commitPersisted({ assessment, targetJarId: "food", triggerTxnId: "t1", postedAt: SEP, origin: "auto" })
        .catch((e: unknown) => (error = e));
    });
    expect(error).toBeInstanceOf(Error);
    expect(allRebalances(result.current.manualTxns)).toHaveLength(0);
  });
});
