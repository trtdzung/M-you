import { describe, expect, it } from "vitest";
import type { Account, Asset, JarConfig, Liability, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { getProviders, type PersonaId } from "@/providers";
import { DEMO_NOW, prevMonthKey } from "@/lib/demo-clock";
import {
  aggregateCashflow,
  calculateNetWorth,
  detectRecurring,
  evaluateBudget,
  evaluateJarBudget,
  financialHealth,
  jarSpendable,
  monthPeriodFromKey,
  selectUnlabeledSpend,
  spendingByCategory,
  upcomingObligations,
} from "..";
import { computeFinancials, type RawData } from "../finance-compose";
import { txn } from "./helpers";

/** Load a persona's raw provider bundle (server-style, no React). */
async function loadRaw(personaId: PersonaId): Promise<RawData> {
  const p = getProviders(personaId);
  const [transactions, accounts, assets, liabilities, budgets, snapshots, goals, products] =
    await Promise.all([
      p.listTransactions(),
      p.listAccounts(),
      p.listAssets(),
      p.listLiabilities(),
      p.getBudgets(),
      p.getMonthlySnapshots(),
      p.listGoals(),
      p.listMockProducts(),
    ]);
  return { transactions, accounts, assets, liabilities, budgets, snapshots, goals, products };
}

const MONTH = "2026-09";

describe("computeFinancials", () => {
  it("matches the hook's per-field composition (no regression)", async () => {
    const raw = await loadRaw("stable");
    const f = computeFinancials(raw, MONTH);

    const period = monthPeriodFromKey(MONTH);
    const prevPeriod = monthPeriodFromKey(prevMonthKey(MONTH));
    const recurring = detectRecurring(raw.transactions);

    expect(f.monthKey).toBe(MONTH);
    expect(f.cashflow).toEqual(aggregateCashflow(raw.transactions, period));
    expect(f.prevCashflow).toEqual(aggregateCashflow(raw.transactions, prevPeriod));
    expect(f.networth).toEqual(calculateNetWorth(raw.assets, raw.liabilities));
    expect(f.budgetLines).toEqual(evaluateBudget(raw.budgets, raw.transactions, period, DEMO_NOW));
    expect(f.categorySpend).toEqual(spendingByCategory(raw.transactions, period));
    expect(f.recurring).toEqual(recurring);
    expect(f.obligations).toEqual(
      upcomingObligations(recurring, raw.liabilities, { now: DEMO_NOW, horizonDays: 30 }),
    );
  });

  it("[RT#1] unlabeled summary equals the shared selector (card/sheet parity)", async () => {
    const raw = await loadRaw("stable");
    const f = computeFinancials(raw, MONTH);
    const selection = selectUnlabeledSpend(raw.transactions, monthPeriodFromKey(MONTH));

    // The card reads `f.unlabeled.count`; the sheet reads `selection.items` — same
    // selector, same inputs ⇒ equal by construction.
    expect(f.unlabeled).toEqual({ count: selection.count, amount: selection.amount, source: "mock" });
    expect(selection.items.length).toBe(f.unlabeled.count);
  });

  it("is deterministic across runs and personas", async () => {
    for (const persona of ["stable", "irregular", "wealthy"] as PersonaId[]) {
      const raw = await loadRaw(persona);
      expect(computeFinancials(raw, MONTH)).toEqual(computeFinancials(raw, MONTH));
    }
  });

  it("honours a caller-supplied transaction override (corrections path)", async () => {
    const raw = await loadRaw("stable");
    const empty = computeFinancials(raw, MONTH, { transactions: [] });
    expect(empty.cashflow.expense).toBe(0);
    expect(empty.categorySpend).toEqual([]);
  });

  it("[Red Team C2] computes a numeric end-of-month only for the current month", async () => {
    const raw = await loadRaw("stable");
    // DEMO_NOW is 2026-09 → the projection is valid.
    const current = computeFinancials(raw, "2026-09");
    expect(typeof current.endOfMonth.value).toBe("number");
    expect(current.endOfMonth.meta.source).toBe("estimated");
  });

  it("[Red Team C2] returns end-of-month 'unknown' for a browsed past month", async () => {
    const raw = await loadRaw("stable");
    const past = computeFinancials(raw, "2026-08");
    // A now-anchored projection over a different month is genuinely unknown,
    // never a misleading number (invariant #6).
    expect(past.endOfMonth.value).toBe("unknown");
    expect(past.endOfMonth.meta.source).toBe("estimated");
  });

  it("yields an empty jarBudget (no lines, no set limit) when no jarConfig is supplied", async () => {
    const raw = await loadRaw("stable");
    const f = computeFinancials(raw, MONTH);
    expect(f.jarBudget.lines).toEqual([]);
    expect(f.jarBudget.summary.totalLimit).toBeNull();
    expect(f.jarBudget.summary.totalSpent).toBe(0);
    expect(f.jarBudget.summary.setCount).toBe(0);
    expect(f.jarBudget.summary.unsetCount).toBe(0);
  });

  it("threads a supplied jarConfig through to jarBudget, matching evaluateJarBudget directly", async () => {
    const raw = await loadRaw("stable");
    const jarConfig: JarConfig = {
      version: 3,
      jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 5_000_000 }],
    };
    const f = computeFinancials(raw, MONTH, { jarConfig });

    const period = monthPeriodFromKey(MONTH);
    const prevPeriod = monthPeriodFromKey(prevMonthKey(MONTH));

    expect(f.jarBudget).toEqual(
      evaluateJarBudget(jarConfig, raw.transactions, period, prevPeriod, DEMO_NOW),
    );
    expect(f.jarBudget.lines).toHaveLength(1);
    expect(f.jarBudget.lines[0].huId).toBe("food");
    expect(f.jarBudget.lines[0].limit).toBe(5_000_000);
  });

  it("[red-team #3] merges user assets/liabilities into net worth without double-counting seed", async () => {
    const raw = await loadRaw("stable");
    const seed = computeFinancials(raw, MONTH);

    const userAsset: Asset = {
      id: "ua", type: "cash", name: "Ví", value: 6_000_000, currency: "VND",
      source: "self_reported", lastUpdatedAt: "2026-09-09T00:00:00.000Z", isEstimated: true,
    };
    const userLiability: Liability = {
      id: "ul", type: "credit_card", name: "Thẻ", outstandingPrincipal: 2_000_000,
      interestRate: 0.3, minimumPayment: 200_000, dueDate: null, remainingTerm: null,
      source: "self_reported", lastUpdatedAt: "2026-09-09T00:00:00.000Z",
    };

    const withUser = computeFinancials(raw, MONTH, {
      userAssets: [userAsset],
      userLiabilities: [userLiability],
    });

    // Each user record is counted EXACTLY once on top of the seed totals.
    expect(withUser.networth.assetsTotal).toBe(seed.networth.assetsTotal + 6_000_000);
    expect(withUser.networth.liabilitiesTotal).toBe(seed.networth.liabilitiesTotal + 2_000_000);
    expect(withUser.networth.breakdown.filter((i) => i.id === "ua")).toHaveLength(1);

    // The seed-only path is untouched (listAssets stays seed-only, red-team #3).
    expect(computeFinancials(raw, MONTH).networth).toEqual(seed.networth);
  });

  it("[red-team #6] keeps a user asset with unknown valuation unknown (never 0)", async () => {
    const raw = await loadRaw("stable");
    const seed = computeFinancials(raw, MONTH);
    const unvalued: Asset = {
      id: "ua_unknown", type: "real_estate", name: "Đất chưa định giá", value: null,
      currency: "VND", source: "self_reported", lastUpdatedAt: "2026-09-09T00:00:00.000Z", isEstimated: true,
    };
    const withUser = computeFinancials(raw, MONTH, { userAssets: [unvalued] });
    expect(withUser.networth.assetsTotal).toBe(seed.networth.assetsTotal); // not summed
    expect(withUser.networth.hasUnknown).toBe(true);
    expect(withUser.networth.unknownFields).toContain("Đất chưa định giá");
  });

  it("composes financial health from the same inputs (non-trivial: debt + assets)", async () => {
    // The "wealthy" persona carries multiple assets (incl. one unvalued property)
    // and three liabilities — a genuine wealth picture, not the empty default.
    const raw = await loadRaw("wealthy");
    const f = computeFinancials(raw, MONTH);

    // Composed once here — every indicator must trace to the SAME cashflow /
    // accounts / networth the rest of `Financials` exposes (DRY, no local recompute).
    expect(f.health).toEqual(financialHealth(f.cashflow, raw.accounts, f.networth));

    // Both indicators are populated (not the null default) for this persona.
    expect(f.health.runwayMonths.value).not.toBeNull();
    expect(f.health.concentration.value).not.toBeNull();

    // Derived → provenance forced to "estimated" (invariant #5).
    for (const ind of [f.health.runwayMonths, f.health.concentration]) {
      expect(ind.source).toBe("estimated");
    }

    // Concentration must flag the unvalued property so its % isn't read as whole
    // (invariant #6 — unknown assets stay unknown, never counted as 0).
    expect(f.health.concentration.hasUnknown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 07 — double-entry correctness + C1 pool identity (plan 260918-1120)
// ---------------------------------------------------------------------------

const REBALANCE_MONTH = "2026-06";

function currentAccount(id: string, availableBalance: number): Account {
  return {
    id,
    type: "current",
    institution: "MSB",
    currency: "VND",
    balance: availableBalance,
    availableBalance,
    lastSyncedAt: "2026-06-20T00:00:00.000Z",
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
  };
}

/** A minimal, fully synthetic RawData bundle — deterministic, no persona fixtures. */
function makeRaw(over: { transactions: Transaction[]; accounts: Account[] }): RawData {
  return {
    transactions: over.transactions,
    accounts: over.accounts,
    assets: [],
    liabilities: [],
    budgets: [],
    snapshots: [],
    goals: [],
    products: [],
  };
}

function rebalanceTxn(over: Partial<Transaction> = {}): Transaction {
  return txn({
    id: "reb-1",
    categoryId: REBALANCE_CATEGORY,
    type: "transfer",
    postedAt: "2026-06-10T10:00:00.000Z",
    amount: 500_000,
    rebalance: { fromJarId: "buf", toJarId: "food", triggerTxnId: "trigger-1", origin: "auto" },
    ...over,
  });
}

describe("computeFinancials — double-entry correctness (rebalance never inflates spend-by-category)", () => {
  it("a `dieu-chinh-hu` rebalance leaves categorySpend/cashflow untouched but reconciles both jars' remaining", () => {
    const jarConfig: JarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
        { id: "buf", label: "Dự phòng", categoryIds: ["savings-cat"], budgetLimit: 3_000_000, role: "buffer" },
      ],
    };
    const realSpend = txn({ id: "spend-1", categoryId: "dining", amount: 4_500_000, postedAt: "2026-06-05T10:00:00.000Z" });
    const raw = makeRaw({ transactions: [realSpend, rebalanceTxn()], accounts: [currentAccount("cur", 20_000_000)] });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });

    // The REAL spend keeps its REAL category at its full amount — the rebalance
    // never spreads into "buf"'s (the donor's) category, and never double-counts.
    expect(f.categorySpend.find((c) => c.categoryId === "dining")?.amount).toBe(4_500_000);
    expect(f.categorySpend.some((c) => c.categoryId === REBALANCE_CATEGORY)).toBe(false);
    expect(f.cashflow.expense).toBe(4_500_000); // rebalance amount excluded from thu/chi

    // The jarBudget `spent` numbers are the untouched spend-vs-limit truth...
    const byId = new Map(f.jarBudget.lines.map((l) => [l.huId, l]));
    expect(byId.get("food")!.spent).toBe(4_500_000);
    expect(byId.get("buf")!.spent).toBe(0);
    // ...while `remaining` reconciles the rebalance: food was 500k over, now covered.
    expect(byId.get("food")!.remaining).toBe(0);
    expect(byId.get("buf")!.remaining).toBe(2_500_000); // 3M − 0 − 500k given away

    // The rebalance is surfaced on `jarRebalances` (not lost, not silently folded).
    expect(f.jarRebalances).toHaveLength(1);
    expect(f.jarRebalances[0].rebalance).toEqual({
      fromJarId: "buf",
      toJarId: "food",
      triggerTxnId: "trigger-1",
      origin: "auto",
    });
  });
});

describe("computeFinancials — C1 pool identity: pool + Σ spendable == CASA (never pool + Σ remaining)", () => {
  it("holds in the ordinary funded case", () => {
    const jarConfig: JarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000 },
        { id: "bills", label: "Hóa đơn", categoryIds: ["housing"], budgetLimit: 5_000_000 },
      ],
    };
    const raw = makeRaw({
      transactions: [txn({ categoryId: "dining", amount: 1_000_000 })],
      accounts: [currentAccount("cur", 12_000_000)],
    });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });
    const spendableTotal = f.jarBudget.lines.reduce((s, l) => s + (jarSpendable(l.remaining) ?? 0), 0);
    expect((f.unallocatedPool.amount as number) + spendableTotal).toBe(12_000_000);
    expect(f.unallocatedPool.overAllocated).toBe(false);
  });

  it("holds even when a donor's remaining is floored at 0 by an overspend (donor-crosses-0) — pool + Σremaining would NOT", () => {
    // food is 2M over its 4M limit (remaining −2M, spendable floored at 0); bills is
    // untouched. The identity must still use Σ spendable, never the raw Σ remaining.
    const jarConfig: JarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000 },
        { id: "bills", label: "Hóa đơn", categoryIds: ["housing"], budgetLimit: 5_000_000 },
      ],
    };
    const raw = makeRaw({
      transactions: [txn({ categoryId: "dining", amount: 6_000_000 })], // 2M over
      accounts: [currentAccount("cur", 12_000_000)],
    });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });
    const byId = new Map(f.jarBudget.lines.map((l) => [l.huId, l]));
    expect(byId.get("food")!.remaining).toBe(-2_000_000); // true (un-floored) shortfall

    const spendableTotal = f.jarBudget.lines.reduce((s, l) => s + (jarSpendable(l.remaining) ?? 0), 0);
    const remainingTotal = f.jarBudget.lines.reduce((s, l) => s + (l.remaining ?? 0), 0);
    expect((f.unallocatedPool.amount as number) + spendableTotal).toBe(12_000_000); // C1 identity holds
    expect((f.unallocatedPool.amount as number) + remainingTotal).not.toBe(12_000_000); // the false identity does NOT
  });

  it("surfaces the over-allocated residual (Σ budget > CASA) — bounded fundability, never a silent auto-eliminate", () => {
    // Two jars claim 20M of spendable against a CASA of only 12M (drift/over-allocation).
    const jarConfig: JarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 12_000_000 },
        { id: "bills", label: "Hóa đơn", categoryIds: ["housing"], budgetLimit: 8_000_000 },
      ],
    };
    const raw = makeRaw({ transactions: [], accounts: [currentAccount("cur", 12_000_000)] });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });
    const spendableTotal = f.jarBudget.lines.reduce((s, l) => s + (jarSpendable(l.remaining) ?? 0), 0);

    expect(spendableTotal).toBe(20_000_000); // both jars fully claim their unspent limit
    expect(f.unallocatedPool.amount).toBe(-8_000_000); // CASA − 20M, kept truthfully negative (never clamped)
    expect(f.unallocatedPool.overAllocated).toBe(true); // "Vượt phân bổ" surfaced, not silently eaten
    expect((f.unallocatedPool.amount as number) + spendableTotal).toBe(12_000_000); // identity still holds on the residual
  });
});

describe("computeFinancials — one unallocated number (D26/S12/D27)", () => {
  const jarConfig: JarConfig = {
    version: 3,
    jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 3_000_000 }],
  };

  it("overview pending === picker pool (CASA − Σ spendable), after spend", () => {
    const raw = makeRaw({
      transactions: [txn({ categoryId: "dining", amount: 500_000 })],
      accounts: [currentAccount("cur", 8_000_000)],
    });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });
    expect(f.unallocatedPool.amount).toBe(5_500_000);
    expect(f.jarEnvelope.pending.amount).toBe(f.unallocatedPool.amount);
    expect(f.jarEnvelope.pending.overAllocated).toBe(f.unallocatedPool.overAllocated);
  });

  it("D27: no current account → both are 'unknown', never a fabricated negative", () => {
    const raw = makeRaw({ transactions: [], accounts: [] });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });
    expect(f.unallocatedPool.amount).toBe("unknown");
    expect(f.unallocatedPool.overAllocated).toBe(false);
    expect(f.jarEnvelope.pending.amount).toBe("unknown");
  });

  it("S2: a pool cover leg (pool → jar) clears the jar's overspend and keeps the C1 identity", () => {
    // CASA 8tr (already debited). food limit 3tr, spent 3.5tr → 500k over; the pool
    // covered it with a `fromJarId: "pool"` leg → food remaining 0, not "cần bù".
    const cover = txn({
      type: "transfer",
      categoryId: REBALANCE_CATEGORY,
      amount: 500_000,
      rebalance: { fromJarId: "pool", toJarId: "food", triggerTxnId: "t", origin: "auto" },
    });
    const raw = makeRaw({
      transactions: [txn({ categoryId: "dining", amount: 3_500_000 }), cover],
      accounts: [currentAccount("cur", 8_000_000)],
    });
    const f = computeFinancials(raw, REBALANCE_MONTH, { jarConfig });
    const food = f.jarBudget.lines[0];
    expect(food.remaining).toBe(0);
    expect(food.status).not.toBe("over");
    expect(f.jarEnvelope.jars[0].overLimit).toBe(false);
    const spendableTotal = f.jarBudget.lines.reduce((s, l) => s + (jarSpendable(l.remaining) ?? 0), 0);
    expect((f.unallocatedPool.amount as number) + spendableTotal).toBe(8_000_000); // C1 identity
    expect(f.unallocatedPool.amount).toBe(8_000_000); // pool not debited twice by the leg
  });
});
