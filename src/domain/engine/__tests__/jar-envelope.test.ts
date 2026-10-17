import { describe, it, expect } from "vitest";
import type { Account, JarConfig, Transaction } from "@/domain/models";
import { withSeedDeposits } from "@/test-utils/jar-ledger-fixtures";
import { monthPeriod } from "../types";
import { jarBalances } from "../jar-balance";
import { evaluateJarEnvelope, jarEnvelopeLines, casaPool } from "../jar-envelope";
import { computeUnallocatedPool } from "../unallocated-pool";
import { rebalanceLegs, txn } from "./helpers";

const PERIOD = monthPeriod(2026, 8); // 09/2026
const IN = "2026-09-10T00:00:00.000Z";

function account(id: string, availableBalance: number, over: Partial<Account> = {}): Account {
  return {
    id,
    type: "current",
    institution: "MSB",
    currency: "VND",
    balance: availableBalance,
    availableBalance,
    lastSyncedAt: IN,
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
    ...over,
  };
}

/** Config helper: each jar owns a category named after its id; `budgetLimit` undefined = chưa đặt. */
function config(jars: { id: string; label: string; budgetLimit?: number }[]): JarConfig {
  return { version: 3, jars: jars.map((j) => ({ ...j, categoryIds: [j.id] })) };
}

const CONFIG = config([
  { id: "food", label: "Ăn uống" },
  { id: "bills", label: "Hóa đơn" },
  { id: "khac", label: "Khác" },
]);

const NO_SPEND = new Map<string, number>();
const CURRENT = [account("cur", 5_000_000)];

/**
 * Real running balances for a MIGRATED config (opening deposit = limit at the month
 * start, `withSeedDeposits`) given this period's spend per jar and net rebalance per
 * jar — synthesised as txns so `jarBalances` (the engine) derives every balance.
 */
function balancesFor(cfg: JarConfig, spent: Map<string, number>, net = new Map<string, number>()) {
  const txns: Transaction[] = [...spent].map(([jarId, amount]) => txn({ categoryId: jarId, amount, postedAt: IN }));
  return jarBalances(withSeedDeposits(cfg, PERIOD.from), [...txns, ...rebalanceLegs(net, IN)], PERIOD.to);
}

/** `evaluateJarEnvelope` over the migrated config's real balances. */
function envelopeOf(cfg: JarConfig, accounts: Account[], spent = NO_SPEND, net?: Map<string, number>) {
  return evaluateJarEnvelope(cfg, accounts, spent, PERIOD, balancesFor(cfg, spent, net));
}

describe("casaPool", () => {
  it("no current account → unknown", () => {
    expect(casaPool([]).amount).toBe("unknown");
  });

  it("sums availableBalance across current accounts; savings/credit ignored", () => {
    const accounts = [account("cur1", 2_000_000), account("cur2", 3_000_000), account("sav", 9_000_000, { type: "savings" })];
    expect(casaPool(accounts).amount).toBe(5_000_000);
  });
});

describe("evaluateJarEnvelope — CASA pool (chờ phân bổ)", () => {
  it("no current account → pool and pending genuinely unknown (never 0)", () => {
    const res = envelopeOf(CONFIG, [], NO_SPEND);
    expect(res.pending.pool).toBe("unknown");
    expect(res.pending.amount).toBe("unknown");
  });

  it("pool = Σ availableBalance of current accounts; savings/credit are ignored", () => {
    const accounts = [account("cur", 5_000_000), account("sav", 10_000_000, { type: "savings" })];
    const res = envelopeOf(CONFIG, accounts, NO_SPEND);
    expect(res.pending.pool).toBe(5_000_000);
    expect(res.pending.amount).toBe(5_000_000);
  });

  it("sums pool across multiple current accounts", () => {
    const accounts = [account("cur1", 2_000_000), account("cur2", 3_000_000)];
    const res = envelopeOf(CONFIG, accounts, NO_SPEND);
    expect(res.pending.pool).toBe(5_000_000);
  });

  it("pending = pool − Σ spendable (opening deposit = limit, no spend)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const res = envelopeOf(cfg, CURRENT, NO_SPEND);
    expect(res.pending.amount).toBe(3_000_000);
    expect(res.pending.allocated).toBe(2_000_000);
  });

  it("jars claiming more than CASA → pending keeps the TRUE negative + overAllocated (no clamp)", () => {
    // Never floored at 0: the cap is already breached, and the UI hides a ≤ 0 card
    // rather than inviting the user to split money `fitsCasaCap` would reject.
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 4_000_000 },
      { id: "bills", label: "Hóa đơn", budgetLimit: 4_000_000 },
    ]);
    const res = envelopeOf(cfg, CURRENT, NO_SPEND);
    expect(res.pending.amount).toBe(-3_000_000);
    expect(res.pending.overAllocated).toBe(true);
  });
});

describe("evaluateJarEnvelope — pending is the unallocated pool (balance lens, D26)", () => {
  it("balance lens: CASA 10tr, limit 5tr, spent 1tr → spendable 4tr → pending 6tr (== unallocated pool)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 5_000_000 }]);
    const res = envelopeOf(cfg, [account("cur", 10_000_000)], new Map([["food", 1_000_000]]));
    expect(res.pending.amount).toBe(6_000_000);
    expect(res.pending.allocated).toBe(4_000_000); // Σ spendable, not the 5tr limit
    // Now IDENTICAL to the transfer picker's "Chưa phân bổ" (one definition, D26).
    expect(res.pending.amount).toBe(
      computeUnallocatedPool({ casaBalance: 10_000_000, spendableTotal: 4_000_000 }).amount,
    );
  });

  it("pending === pool − allocated, so it always matches the sheet's 'Còn lại để chia'", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 3_000_000 }]);
    const res = envelopeOf(cfg, [account("cur", 8_000_000)], new Map([["food", 500_000]]));
    expect(res.pending.amount).toBe((res.pending.pool as number) - res.pending.allocated);
    expect(res.pending.amount).toBe(5_500_000); // 8tr − 2,5tr spendable
  });

  it("an overspent jar claims 0 (its balance is gone); unset jars claim nothing", () => {
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 1_000_000 },
      { id: "bills", label: "Hóa đơn" },
    ]);
    const res = envelopeOf(cfg, CURRENT, new Map([["food", 1_500_000]]));
    expect(res.pending.amount).toBe(5_000_000); // 5tr − 0 (food spendable 0, bills unset → 0)
    expect(res.pending.overAllocated).toBe(false);
  });

  it("D27: no CASA account → pending 'unknown' and not overAllocated (never a fabricated negative)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 500_000 }]);
    const res = envelopeOf(cfg, [], NO_SPEND);
    expect(res.pending.amount).toBe("unknown");
    expect(res.pending.overAllocated).toBe(false);
  });

  it("a corrupt budgetLimit (NaN) is unset — never NaN in pending", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: NaN }]);
    const res = envelopeOf(cfg, CURRENT, NO_SPEND);
    expect(res.jars[0].limit).toBeNull();
    expect(res.pending.amount).toBe(5_000_000);
  });
});

describe("evaluateJarEnvelope — per-jar limit + running balance (migrated jar: opening = limit)", () => {
  it("migrated jar → balance = opening(limit) − spent; its SPENDABLE (not the limit) counts toward pending.allocated", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const spent = new Map([["food", 800_000]]);
    const res = envelopeOf(cfg, CURRENT, spent);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.limit).toBe(2_000_000);
    expect(food.spent).toBe(800_000);
    expect(food.balance).toBe(1_200_000);
    expect(food.inUse).toBe(true);
    expect(food.source).toBe("self_reported");
    // Balance lens: allocated = Σ spendable = max(0, balance), NOT the 2tr limit.
    expect(res.pending.allocated).toBe(1_200_000);
  });

  it("no budgetLimit (no opening deposit) → limit/balance null, inUse false, source mock (never a fabricated 0)", () => {
    const res = envelopeOf(CONFIG, CURRENT, NO_SPEND);
    const bills = res.jars.find((j) => j.jarId === "bills")!;
    expect(bills.limit).toBeNull();
    expect(bills.balance).toBeNull();
    expect(bills.inUse).toBe(false);
    expect(bills.source).toBe("mock");
  });

  it("balance may be negative when spend exceeds the deposit (overspent, never coerced)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 1_000_000 }]);
    const spent = new Map([["food", 1_500_000]]);
    const res = envelopeOf(cfg, CURRENT, spent);
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.balance).toBe(-500_000);
  });

  it("overLimit is true only when a budgetLimit is set and spent exceeds it", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 1_000_000 }]);
    const over = envelopeOf(cfg, CURRENT, new Map([["food", 1_500_000]]));
    expect(over.jars[0].overLimit).toBe(true);
    const under = envelopeOf(cfg, CURRENT, new Map([["food", 500_000]]));
    expect(under.jars[0].overLimit).toBe(false);
  });

  it("overLimit is false when the jar has no budgetLimit even with spend", () => {
    const res = envelopeOf(CONFIG, CURRENT, new Map([["food", 1_500_000]]));
    const food = res.jars.find((j) => j.jarId === "food")!;
    expect(food.limit).toBeNull();
    expect(food.overLimit).toBe(false);
  });

  it("mirrors the real case: pool 18tr, limits summing 17tr → pending 1tr", () => {
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 5_000_000 },
      { id: "bills", label: "Hóa đơn", budgetLimit: 7_000_000 },
      { id: "khac", label: "Khác", budgetLimit: 5_000_000 },
    ]);
    const res = envelopeOf(cfg, [account("cur", 18_000_000)], NO_SPEND);
    expect(res.pending.allocated).toBe(17_000_000);
    expect(res.pending.pool).toBe(18_000_000);
    expect(res.pending.amount).toBe(1_000_000);
  });

  it("balance lens: pending = CASA − Σ spendable, stable through spending", () => {
    // With spending this period, CASA is the LIVE (post-spend) balance and each
    // jar's spendable has shrunk by what it spent — so pending stays the true
    // "chưa gán vào hũ nào", NOT the old limit lens (which would show 199,9K here).
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 4_000_000 },
      { id: "bills", label: "Hóa đơn", budgetLimit: 8_000_000 },
      { id: "khac", label: "Khác", budgetLimit: 5_000_000 },
    ]);
    const spent = new Map([["food", 3_500_000], ["bills", 6_000_000], ["khac", 3_390_000]]);
    const res = envelopeOf(cfg, [account("cur", 17_199_900)], spent);
    // balance: food 0,5tr · bills 2tr · khac 1,61tr → Σ spendable 4,11tr.
    const spendableTotal = res.jars.reduce((s, l) => s + Math.max(0, l.balance ?? 0), 0);
    expect(spendableTotal).toBe(4_110_000);
    expect(res.pending.allocated).toBe(4_110_000);
    expect(res.pending.pool).toBe(17_199_900);
    // 17,199,900 − 4,110,000 = 13,089,900 — the money no jar's balance claims yet.
    expect(res.pending.amount).toBe(13_089_900);
  });

  it("is deterministic (same inputs → same output)", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const a = envelopeOf(cfg, CURRENT, NO_SPEND);
    const b = envelopeOf(cfg, CURRENT, NO_SPEND);
    expect(a).toEqual(b);
  });
});

describe("evaluateJarEnvelope — rebalance fold: moves `balance` (SỐ DƯ), never `overLimit`", () => {
  it("balance folds the net rebalance; overLimit keeps measuring spent vs the ORIGINAL budgetLimit", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 4_000_000 }]);
    const spent = new Map([["food", 4_500_000]]); // 500k over budget
    const withoutCoverage = envelopeOf(cfg, CURRENT, spent);
    expect(withoutCoverage.jars[0].balance).toBe(-500_000);
    expect(withoutCoverage.jars[0].overLimit).toBe(true);

    const net = new Map([["food", 500_000]]); // a donor covered the overspend
    const withCoverage = envelopeOf(cfg, CURRENT, spent, net);
    expect(withCoverage.jars[0].balance).toBe(0); // (4M − 4.5M) + 0.5M — balance healed
    expect(withCoverage.jars[0].limit).toBe(4_000_000); // plan untouched
    expect(withCoverage.jars[0].overLimit).toBe(true); // 4.5M spent on a 4M plan is still "vượt"
  });

  it("a jar that DONATED (negative net) shows a lowered balance but is NOT 'vượt'", () => {
    const cfg = config([{ id: "bills", label: "Hóa đơn", budgetLimit: 1_000_000 }]);
    const spent = new Map([["bills", 800_000]]); // within budget on its own
    const net = new Map([["bills", -400_000]]); // donated 400k to another jar
    const res = envelopeOf(cfg, CURRENT, spent, net);
    expect(res.jars[0].balance).toBe(1_000_000 - 800_000 - 400_000); // -200k: hết tiền
    expect(res.jars[0].overLimit).toBe(false); // but it never overspent its own plan
  });

  it("no balances argument → every balance null (unfunded), nothing allocated — never a fabricated 0", () => {
    const cfg = config([{ id: "food", label: "Ăn uống", budgetLimit: 2_000_000 }]);
    const spent = new Map([["food", 500_000]]);
    const res = evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD);
    expect(res.jars[0].balance).toBeNull();
    expect(res.jars[0].source).toBe("mock");
    expect(res.jars[0].overLimit).toBe(false); // limit axis still computed
    expect(res.pending.allocated).toBe(0);
    expect(res).toEqual(evaluateJarEnvelope(cfg, CURRENT, spent, PERIOD, new Map()));
  });
});

describe("jarEnvelopeLines", () => {
  it("reads the limit from config and the balance from `jarBalances` per jar", () => {
    const cfg = config([
      { id: "food", label: "Ăn uống", budgetLimit: 3_000_000 },
      { id: "bills", label: "Hóa đơn" },
    ]);
    const spent = new Map([["food", 1_000_000]]);
    const lines = jarEnvelopeLines(cfg, spent, balancesFor(cfg, spent));
    expect(lines.find((l) => l.jarId === "food")!.limit).toBe(3_000_000);
    expect(lines.find((l) => l.jarId === "food")!.balance).toBe(2_000_000);
    expect(lines.find((l) => l.jarId === "bills")!.balance).toBeNull();
  });
});
