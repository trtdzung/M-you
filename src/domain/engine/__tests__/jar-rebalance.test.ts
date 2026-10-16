import { describe, expect, it } from "vitest";
import type { Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { rebalanceNetByJar, rebalanceTxns } from "../jar-rebalance";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

/**
 * `rebalanceNetByJar`/`rebalanceTxns` — the ONLY place a `dieu-chinh-hu`-tagged
 * Transaction's meta becomes engine numbers (plan 260918-1120, Phase 03). Locks
 * the fold rule (`Σ nhận − Σ cho`), the `"pool"` sentinel skip (the pool is
 * derived, never a bucket), and the active-record filter (posted, in-period,
 * meta present).
 */

const JUNE = monthPeriod(2026, 5); // 06/2026
const MAY = monthPeriod(2026, 4); // 05/2026

function rebalance(over: Partial<Transaction> = {}): Transaction {
  return txn({
    categoryId: REBALANCE_CATEGORY,
    type: "transfer",
    status: "posted",
    postedAt: "2026-06-10T10:00:00.000Z",
    amount: 1_000_000,
    rebalance: { fromJarId: "buf", toJarId: "food", triggerTxnId: "trigger-1", origin: "auto" },
    ...over,
  });
}

describe("rebalanceNetByJar — the ONLY fold of rebalance meta into jar numbers", () => {
  it("nets +amount onto toJarId and −amount onto fromJarId", () => {
    const net = rebalanceNetByJar([rebalance()], JUNE);
    expect(net.get("food")).toBe(1_000_000); // nhận
    expect(net.get("buf")).toBe(-1_000_000); // cho
  });

  it("accumulates multiple rebalances touching the SAME jar", () => {
    const txns = [
      rebalance({ id: "r1", rebalance: { fromJarId: "buf", toJarId: "food", triggerTxnId: "t1", origin: "auto" } }),
      rebalance({ id: "r2", amount: 500_000, rebalance: { fromJarId: "ess", toJarId: "food", triggerTxnId: "t1", origin: "auto" } }),
    ];
    const net = rebalanceNetByJar(txns, JUNE);
    expect(net.get("food")).toBe(1_500_000); // two donors, one target
    expect(net.get("buf")).toBe(-1_000_000);
    expect(net.get("ess")).toBe(-500_000);
  });

  it("a jar that is BOTH a donor and a receiver nets the two legs", () => {
    const txns = [
      rebalance({ id: "r1", amount: 800_000, rebalance: { fromJarId: "buf", toJarId: "food", triggerTxnId: "t1", origin: "auto" } }),
      rebalance({ id: "r2", amount: 300_000, rebalance: { fromJarId: "food", toJarId: "ess", triggerTxnId: "t2", origin: "manual" } }),
    ];
    const net = rebalanceNetByJar(txns, JUNE);
    expect(net.get("food")).toBe(800_000 - 300_000); // received 800k, gave 300k
  });

  it("the `\"pool\"` sentinel is NEVER credited/debited — it is derived, never a bucket", () => {
    const txns = [rebalance({ rebalance: { fromJarId: "pool", toJarId: "food", triggerTxnId: "t1", origin: "auto" } })];
    const net = rebalanceNetByJar(txns, JUNE);
    expect(net.get("food")).toBe(1_000_000); // real jar still credited
    expect(net.has("pool")).toBe(false); // pool never gets its own map entry
  });

  it("a jar untouched by any rebalance is absent from the map (callers treat missing as 0)", () => {
    const net = rebalanceNetByJar([rebalance()], JUNE);
    expect(net.has("untouched")).toBe(false);
  });

  it("excludes a PENDING rebalance (not yet posted)", () => {
    const net = rebalanceNetByJar([rebalance({ status: "pending" })], JUNE);
    expect(net.has("food")).toBe(false);
  });

  it("excludes a rebalance OUTSIDE the requested period", () => {
    const net = rebalanceNetByJar([rebalance({ postedAt: "2026-05-10T10:00:00.000Z" })], JUNE);
    expect(net.has("food")).toBe(false);
    expect(rebalanceNetByJar([rebalance({ postedAt: "2026-05-10T10:00:00.000Z" })], MAY).get("food")).toBe(1_000_000);
  });

  it("excludes an ordinary REAL-category spend txn even if it happens to carry no meta", () => {
    const net = rebalanceNetByJar([txn({ categoryId: "dining", amount: 1_000_000 })], JUNE);
    expect(net.size).toBe(0);
  });

  it("excludes a REBALANCE_CATEGORY txn with no `rebalance` meta (defensive — never crashes)", () => {
    const malformed = txn({ categoryId: REBALANCE_CATEGORY, type: "transfer", postedAt: "2026-06-10T10:00:00.000Z" });
    const net = rebalanceNetByJar([malformed], JUNE);
    expect(net.size).toBe(0);
  });

  it("empty input yields an empty map", () => {
    expect(rebalanceNetByJar([], JUNE).size).toBe(0);
  });
});

describe("rebalanceTxns — the period's active rebalance records (display surface)", () => {
  it("returns only posted, in-period, meta-carrying rebalance txns", () => {
    const inPeriod = rebalance({ id: "r1" });
    const outOfPeriod = rebalance({ id: "r2", postedAt: "2026-05-01T00:00:00.000Z" });
    const pending = rebalance({ id: "r3", status: "pending" });
    const realSpend = txn({ id: "r4", categoryId: "dining" });
    const result = rebalanceTxns([inPeriod, outOfPeriod, pending, realSpend], JUNE);
    expect(result.map((t) => t.id)).toEqual(["r1"]);
  });

  it("is empty when nothing rebalanced this period", () => {
    expect(rebalanceTxns([txn({ categoryId: "dining" })], JUNE)).toEqual([]);
  });
});

describe("rebalanceNetByJar — dirty-amount guards (F08b) + pool donor (S2)", () => {
  it.each([-500, 0, NaN, Infinity])("a leg with amount=%s is ignored (never inverts direction / leaks NaN)", (amount) => {
    const net = rebalanceNetByJar([rebalance({ amount })], JUNE);
    expect(net.size).toBe(0);
  });

  it("a valid leg alongside a dirty one still folds normally", () => {
    const net = rebalanceNetByJar([rebalance({ id: "ok", amount: 200 }), rebalance({ id: "bad", amount: -500 })], JUNE);
    expect(net.get("food")).toBe(200);
    expect(net.get("buf")).toBe(-200);
  });

  it("a pool-donor leg (fromJarId 'pool') credits the target jar; the pool end is skipped", () => {
    const net = rebalanceNetByJar(
      [rebalance({ amount: 300, rebalance: { fromJarId: "pool", toJarId: "food", triggerTxnId: "t", origin: "auto" } })],
      JUNE,
    );
    expect(net.get("food")).toBe(300);
    expect(net.has("pool")).toBe(false);
  });

  it("a leg posted at 00:30 on the 1st VN time belongs to that VN month (not the previous)", () => {
    const leg = rebalance({ postedAt: "2026-06-01T00:30:00+07:00" }); // = 31/05 17:30Z
    expect(rebalanceNetByJar([leg], JUNE).get("food")).toBe(1_000_000);
    expect(rebalanceNetByJar([leg], MAY).size).toBe(0);
  });
});
