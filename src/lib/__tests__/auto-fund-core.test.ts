import { describe, expect, it } from "vitest";
import type { Account, JarConfig, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { POOL_DONOR_ID, type DonorProposal } from "@/domain/engine";
import {
  jarIdForCategory,
  overspendOf,
  rebalanceInputsFor,
  snapshotForDate,
  type AutoFundDeps,
} from "../auto-fund-core";

/**
 * `auto-fund-core.ts` — the pure half of the shared auto-fund unit (plan
 * 260918-1120, Phases 04/05). Tested here with NO React so the funding/reconcile
 * math is pinned deterministically (invariant #1); `use-auto-fund.test.tsx`
 * covers only the React/store orchestration this core doesn't own.
 */

function account(id: string, availableBalance: number): Account {
  return {
    id,
    type: "current",
    institution: "MSB",
    currency: "VND",
    balance: availableBalance,
    availableBalance,
    lastSyncedAt: "2026-09-15T00:00:00.000Z",
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
  };
}

let seq = 0;
function txn(over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: over.id ?? `t${seq}`,
    accountId: "acc",
    postedAt: over.postedAt ?? "2026-09-10T10:00:00.000Z",
    amount: over.amount ?? 100_000,
    currency: "VND",
    direction: over.direction ?? "debit",
    type: over.type ?? "expense",
    merchantName: over.merchantName ?? "Cửa hàng",
    merchantNormalizedName: over.merchantNormalizedName ?? "cua hang",
    categoryId: over.categoryId ?? "dining",
    status: over.status ?? "posted",
    source: over.source ?? "self_reported",
    isRecurring: false,
    userEdited: false,
    ...(over.rebalance ? { rebalance: over.rebalance } : {}),
  };
}

const JAR_CONFIG: JarConfig = {
  version: 3,
  jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" }],
};

describe("snapshotForDate — H4: the snapshot is pinned to postedAt's month, never 'now' or the viewed month", () => {
  const augSpend = txn({ id: "aug", amount: 3_000_000, postedAt: "2026-08-12T10:00:00.000Z" });
  const sepSpend = txn({ id: "sep", amount: 1_000_000, postedAt: "2026-09-05T10:00:00.000Z" });
  const deps: AutoFundDeps = {
    transactions: [augSpend, sepSpend],
    accounts: [account("cur", 10_000_000)],
    jarConfig: JAR_CONFIG,
    now: new Date("2026-09-15T00:00:00.000Z"), // "now" is September
  };

  it("a trigger dated in August funds against AUGUST spend only, even though 'now' is September", () => {
    const snap = snapshotForDate(deps, "2026-08-12T10:00:00.000Z");
    expect(snap.month).toBe("2026-08");
    const food = snap.lines.find((l) => l.huId === "food")!;
    expect(food.spent).toBe(3_000_000); // August spend only — September's 1M excluded
    expect(food.remaining).toBe(1_000_000);
  });

  it("a trigger dated in September funds against SEPTEMBER spend only (the symmetric case)", () => {
    const snap = snapshotForDate(deps, "2026-09-05T10:00:00.000Z");
    expect(snap.month).toBe("2026-09");
    const food = snap.lines.find((l) => l.huId === "food")!;
    expect(food.spent).toBe(1_000_000); // September spend only
    expect(food.remaining).toBe(3_000_000);
  });

  it("casaBalance and spendables come from the SAME snapshot regardless of postedAt", () => {
    const snap = snapshotForDate(deps, "2026-08-12T10:00:00.000Z");
    expect(snap.casaBalance).toBe(10_000_000);
    expect(snap.spendables.find((s) => s.id === "food")?.spendable).toBe(1_000_000);
  });
});

describe("snapshotForDate — J06 invalid postedAt + VN month boundary", () => {
  const deps: AutoFundDeps = {
    transactions: [txn({ id: "sep", amount: 1_000_000, postedAt: "2026-09-05T10:00:00.000Z" })],
    accounts: [account("cur", 10_000_000)],
    jarConfig: JAR_CONFIG,
    now: new Date("2026-09-15T00:00:00.000Z"),
  };

  it("an unparseable postedAt falls back to deps.now's month — never throws", () => {
    expect(() => snapshotForDate(deps, "abc")).not.toThrow();
    const snap = snapshotForDate(deps, "abc");
    expect(snap.month).toBe("2026-09");
    expect(snap.lines.find((l) => l.huId === "food")!.spent).toBe(1_000_000);
  });

  it("a trigger at 00:30 01/10 VN (= 30/09 17:30Z) is snapshotted in OCTOBER", () => {
    expect(snapshotForDate(deps, "2026-09-30T17:30:00.000Z").month).toBe("2026-10");
    expect(snapshotForDate(deps, "2026-10-01T00:30:00+07:00").month).toBe("2026-10");
  });
});

describe("C1 identity with a pool cover leg (S2)", () => {
  it("pool + Σ spendable = CASA still holds and the covered jar is back to 0", () => {
    // CASA already debited to 6tr; food limit 4M, spent 4.3M → 300k over, pool covered it.
    const trigger = txn({ id: "trig", amount: 4_300_000, postedAt: "2026-09-05T10:00:00.000Z" });
    const [leg] = rebalanceInputsFor(
      [{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 300_000 }],
      "food",
      "trig",
      "2026-09-05T10:00:00.000Z",
      "auto",
    );
    const legTxn = txn({ id: "leg", ...leg, source: "self_reported" });
    const deps: AutoFundDeps = {
      transactions: [trigger, legTxn],
      accounts: [account("cur", 6_000_000)],
      jarConfig: JAR_CONFIG,
      now: new Date("2026-09-15T00:00:00.000Z"),
    };
    const snap = snapshotForDate(deps, "2026-09-05T10:00:00.000Z");
    const food = snap.lines.find((l) => l.huId === "food")!;
    expect(food.remaining).toBe(0);
    expect(overspendOf(snap.lines, "food")).toBe(0);
    const spendable = snap.spendables.reduce((s, j) => s + (j.spendable ?? 0), 0);
    const pool = snap.casaBalance - spendable;
    expect(pool + spendable).toBe(snap.casaBalance);
    expect(pool).toBe(6_000_000); // the leg never debits the derived pool a second time
  });
});

describe("snapshotForDate — overrides/excludeIds splice a not-yet-rerendered mutation synchronously", () => {
  const trigger = txn({ id: "trig", amount: 3_000_000, postedAt: "2026-09-05T10:00:00.000Z" });
  const oldRebalance = txn({
    id: "reb-old",
    categoryId: REBALANCE_CATEGORY,
    type: "transfer",
    amount: 500_000,
    postedAt: "2026-09-05T10:00:00.000Z",
    rebalance: { fromJarId: "pool", toJarId: "food", triggerTxnId: "trig", origin: "auto" },
  });
  const deps: AutoFundDeps = {
    transactions: [trigger, oldRebalance],
    accounts: [account("cur", 10_000_000)],
    jarConfig: JAR_CONFIG,
    now: new Date("2026-09-15T00:00:00.000Z"),
  };

  it("excludeIds drops an already-removed rebalance from the computed snapshot", () => {
    const withOld = snapshotForDate(deps, "2026-09-05T10:00:00.000Z");
    expect(withOld.lines.find((l) => l.huId === "food")!.remaining).toBe(1_500_000); // 4M − 3M + 0.5M

    const withoutOld = snapshotForDate(deps, "2026-09-05T10:00:00.000Z", { excludeIds: new Set(["reb-old"]) });
    expect(withoutOld.lines.find((l) => l.huId === "food")!.remaining).toBe(1_000_000); // 4M − 3M
  });

  it("overrides applies a patch (e.g. a refund/amount edit) to the trigger txn BEFORE recomputation", () => {
    const refunded = snapshotForDate(deps, "2026-09-05T10:00:00.000Z", {
      overrides: new Map([["trig", { status: "refunded" }]]),
    });
    // A refunded/reversed trigger is excluded from spend by the cashflow rule.
    expect(refunded.lines.find((l) => l.huId === "food")!.spent).toBe(0);
  });

  it("a PARTIAL amount-edit override re-evaluates against the NEW amount (H5/H3 partial refund shape)", () => {
    const shrunk = snapshotForDate(deps, "2026-09-05T10:00:00.000Z", {
      overrides: new Map([["trig", { amount: 1_000_000 }]]),
    });
    expect(shrunk.lines.find((l) => l.huId === "food")!.spent).toBe(1_000_000);
  });
});

describe("overspendOf", () => {
  const lines = [
    { huId: "over", label: "Over", categoryIds: [], spent: 5_000_000, prevSpent: 0, momDelta: 0, momPct: null, limit: 4_000_000, limitState: "set" as const, rebalanceNet: 0, remaining: -1_000_000, pct: 1.25, status: "over" as const, thresholdHit: true, source: "mock" as const, freshness: null },
    { huId: "ok", label: "Ok", categoryIds: [], spent: 1_000_000, prevSpent: 0, momDelta: 0, momPct: null, limit: 4_000_000, limitState: "set" as const, rebalanceNet: 0, remaining: 3_000_000, pct: 0.25, status: "ok" as const, thresholdHit: false, source: "mock" as const, freshness: null },
    { huId: "unset", label: "Unset", categoryIds: [], spent: 0, prevSpent: 0, momDelta: 0, momPct: null, limit: null, limitState: "unset" as const, rebalanceNet: 0, remaining: null, pct: null, status: null, thresholdHit: false, source: "mock" as const, freshness: null },
  ];

  it("returns the positive magnitude of a negative remaining", () => {
    expect(overspendOf(lines, "over")).toBe(1_000_000);
  });

  it("returns 0 for a jar within budget", () => {
    expect(overspendOf(lines, "ok")).toBe(0);
  });

  it("returns 0 for an unset (no-limit) jar — never a fabricated shortfall", () => {
    expect(overspendOf(lines, "unset")).toBe(0);
  });

  it("returns 0 for an unknown jar id (never throws)", () => {
    expect(overspendOf(lines, "does-not-exist")).toBe(0);
  });
});

describe("rebalanceInputsFor — donor chain → dieu-chinh-hu ManualTxnInput[]", () => {
  it("S2/G01: the POOL donor WRITES a pool → target leg so the covered jar is credited", () => {
    const donors: DonorProposal[] = [{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 300_000 }];
    const inputs = rebalanceInputsFor(donors, "food", "trig-1", "2026-09-10T00:00:00.000Z", "auto");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      amount: 300_000,
      categoryId: REBALANCE_CATEGORY,
      rebalance: { fromJarId: POOL_DONOR_ID, toJarId: "food", triggerTxnId: "trig-1", origin: "auto" },
    });
  });

  it("only a pool → pool leg (pool donor on a pool-source lift) is dropped", () => {
    const donors: DonorProposal[] = [{ jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 300_000 }];
    expect(rebalanceInputsFor(donors, null, "trig-1", "2026-09-10T00:00:00.000Z", "auto")).toEqual([]);
  });

  it("a non-finite take is filtered out (never writes a NaN/Infinity leg)", () => {
    const donors: DonorProposal[] = [
      { jarId: "buf", label: "Hũ buf", take: NaN },
      { jarId: "ess", label: "Hũ ess", take: Infinity },
    ];
    expect(rebalanceInputsFor(donors, "food", "trig-1", "2026-09-10T00:00:00.000Z", "auto")).toEqual([]);
  });

  it("a zero-take donor is filtered out (defensive — never writes a no-op rebalance)", () => {
    const donors: DonorProposal[] = [{ jarId: "buf", label: "Hũ buf", take: 0 }];
    expect(rebalanceInputsFor(donors, "food", "trig-1", "2026-09-10T00:00:00.000Z", "auto")).toEqual([]);
  });

  it("a real jar donor produces one debit input tagged REBALANCE_CATEGORY with full meta", () => {
    const donors: DonorProposal[] = [{ jarId: "buf", label: "Hũ buf", take: 300_000 }];
    const inputs = rebalanceInputsFor(donors, "food", "trig-1", "2026-09-10T00:00:00.000Z", "auto");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      amount: 300_000,
      direction: "debit",
      type: "transfer",
      categoryId: REBALANCE_CATEGORY,
      postedAt: "2026-09-10T00:00:00.000Z",
      rebalance: { fromJarId: "buf", toJarId: "food", triggerTxnId: "trig-1", origin: "auto" },
    });
  });

  it("a `null` targetJarId (pool-source lift) maps toJarId to the pool sentinel", () => {
    const donors: DonorProposal[] = [{ jarId: "buf", label: "Hũ buf", take: 200_000 }];
    const inputs = rebalanceInputsFor(donors, null, "trig-1", "2026-09-10T00:00:00.000Z", "auto");
    expect(inputs[0].rebalance).toMatchObject({ fromJarId: "buf", toJarId: POOL_DONOR_ID });
  });

  it("carries `origin: manual` through for an explicit confirm (goal raid / changeSource)", () => {
    const donors: DonorProposal[] = [{ jarId: "goal", label: "Hũ goal", take: 1_000_000 }];
    const inputs = rebalanceInputsFor(donors, "food", "trig-1", "2026-09-10T00:00:00.000Z", "manual");
    expect(inputs[0].rebalance?.origin).toBe("manual");
  });

  it("multiple donors (pool + jars) each produce their own record, in chain order", () => {
    const donors: DonorProposal[] = [
      { jarId: POOL_DONOR_ID, label: "Chưa phân bổ", take: 100_000 },
      { jarId: "buf", label: "Hũ buf", take: 200_000 },
      { jarId: "ess", label: "Hũ ess", take: 300_000 },
    ];
    const inputs = rebalanceInputsFor(donors, "food", "trig-1", "2026-09-10T00:00:00.000Z", "auto");
    expect(inputs.map((i) => i.rebalance?.fromJarId)).toEqual([POOL_DONOR_ID, "buf", "ess"]);
  });
});

describe("jarIdForCategory", () => {
  it("resolves a mapped category to its owning jar", () => {
    expect(jarIdForCategory(JAR_CONFIG, "dining")).toBe("food");
  });

  it("returns null for an unmapped category (e.g. transfer/rebalance) — never a fabricated jar", () => {
    expect(jarIdForCategory(JAR_CONFIG, "transfer")).toBeNull();
    expect(jarIdForCategory(JAR_CONFIG, REBALANCE_CATEGORY)).toBeNull();
  });
});
