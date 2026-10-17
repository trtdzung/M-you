/**
 * Running BALANCE vs monthly LIMIT (plan 260923-jar-limit-vs-balance-split, phase 02).
 * Cases A–L from the phase spec, end to end through `computeFinancials` (one
 * `jarBalances` call shared by jar-budget + jar-envelope). Deterministic fixtures.
 */
import { describe, expect, it } from "vitest";
import type { Account, Jar, JarConfig, JarLedgerEntry, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { DEMO_NOW, transferNow } from "@/lib/demo-clock";
import { monthAnchor, openingDeposit } from "@/test-utils/jar-ledger-fixtures";
import { computeFinancials, type RawData } from "../finance-compose";
import { balanceAsOf, jarBalances } from "../jar-balance";
import { jarNeedsManualTopUp, jarSpendable } from "../jar-spendable";
import { monthPeriodFromKey } from "../types";
import { txn } from "./helpers";

const TR = 1_000_000;
const ANCHOR = monthAnchor("2026-09"); // 2026-09-01 00:00 VN
const NOW = new Date("2026-09-25T03:00:00.000Z");
const CASA = 50 * TR;

const casa: Account = {
  id: "cur",
  type: "current",
  institution: "MSB",
  currency: "VND",
  balance: CASA,
  availableBalance: CASA,
  lastSyncedAt: "2026-09-25T00:00:00.000Z",
  source: "msb",
  maskedNumber: "•••• 0000",
  accountNumber: "000000000000",
};

/** `createdAt: null` = a jar with no stored anchor (falls back to the ledger). */
function food(limit?: number, createdAt: string | null = ANCHOR): Jar {
  return { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: limit, createdAt: createdAt ?? undefined };
}

function entry(amount: number, createdAt: string, kind: "deposit" | "withdraw" = "deposit", id = `led-${createdAt}-${kind}`): JarLedgerEntry {
  return { id, jarId: "food", kind, amount, isOpening: false, createdAt, source: "self_reported" };
}

const cfg = (jar: Jar, ledger: JarLedgerEntry[]): JarConfig => ({ version: 3, jars: [jar], ledger });
const spend = (amount: number, postedAt: string, over: Partial<Transaction> = {}) =>
  txn({ categoryId: "dining", amount, postedAt, ...over });

function compose(config: JarConfig, txns: Transaction[], month = "2026-09", now = NOW) {
  const raw: RawData = { transactions: txns, accounts: [casa], assets: [], liabilities: [], budgets: [], snapshots: [], goals: [], products: [] };
  const f = computeFinancials(raw, month, { now, jarConfig: config });
  const budget = f.jarBudget.lines[0];
  const env = f.jarEnvelope.jars[0];
  // Both engines read the SAME balances map.
  expect(env.balance).toBe(budget.balance);
  return { f, budget, env };
}

describe("jar balance vs monthly limit — cases A–L", () => {
  it("A: limit 7tr, deposit 7tr, spend 3tr → balance 4tr, spent 3tr/7tr, not over", () => {
    const { budget, env } = compose(cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR)]), [spend(3 * TR, "2026-09-10T03:00:00.000Z")]);
    expect(env.balance).toBe(4 * TR);
    expect(env.spent).toBe(3 * TR);
    expect(env.limit).toBe(7 * TR);
    expect(env.overLimit).toBe(false);
    expect(budget.status).toBe("ok");
    expect(env.source).toBe("self_reported");
  });

  it("B: limit 5tr, deposit 7tr, spend 6tr → balance 1tr, over limit", () => {
    const { budget, env } = compose(cfg(food(5 * TR), [openingDeposit("food", 7 * TR, ANCHOR)]), [spend(6 * TR, "2026-09-10T03:00:00.000Z")]);
    expect(env.balance).toBe(1 * TR);
    expect(env.overLimit).toBe(true);
    expect(budget.status).toBe("over");
  });

  it("C: deposit 5tr, spend 6tr → balance −1tr, spendable 0, needs top-up; a 1tr pool→jar rebalance → 0", () => {
    const config = cfg(food(7 * TR), [openingDeposit("food", 5 * TR, ANCHOR)]);
    const spent = spend(6 * TR, "2026-09-10T03:00:00.000Z");
    const before = compose(config, [spent]);
    expect(before.env.balance).toBe(-1 * TR);
    expect(jarSpendable(before.env.balance)).toBe(0);
    expect(jarNeedsManualTopUp(before.budget.balance)).toBe(true);
    // User case: limit 7tr, balance 5tr, spend 6tr → balance −1tr, overLimit false (spend ≤ limit).
    expect(before.env.spent).toBe(6 * TR);
    expect(before.env.limit).toBe(7 * TR);
    expect(before.env.overLimit).toBe(false);

    const cover = txn({
      type: "transfer",
      categoryId: REBALANCE_CATEGORY,
      amount: 1 * TR,
      postedAt: "2026-09-11T03:00:00.000Z",
      rebalance: { fromJarId: "pool", toJarId: "food", triggerTxnId: spent.id, origin: "auto" },
    });
    const after = compose(config, [spent, cover]);
    expect(after.env.balance).toBe(0);
    expect(after.env.overLimit).toBe(false);
    expect(jarNeedsManualTopUp(after.budget.balance)).toBe(false);
    expect(after.budget.rebalanceNet).toBe(1 * TR);
  });

  it("D rollover: 3tr in Sep, 2tr in Oct → Oct view spent 2tr/7tr, balance 2tr (carried)", () => {
    const config = cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR)]);
    const txns = [spend(3 * TR, "2026-09-10T03:00:00.000Z"), spend(2 * TR, "2026-10-10T03:00:00.000Z")];
    const { env } = compose(config, txns, "2026-10", new Date("2026-10-20T03:00:00.000Z"));
    expect(env.spent).toBe(2 * TR);
    expect(env.limit).toBe(7 * TR);
    expect(env.balance).toBe(2 * TR);
  });

  it("E mid-month: created 09-15 with 7tr; 4tr on 09-10 + 1tr on 09-20 → spent 5tr, balance 6tr", () => {
    const created = "2026-09-15T03:00:00.000Z";
    const config = cfg(food(7 * TR, created), [openingDeposit("food", 7 * TR, created)]);
    const { env } = compose(config, [spend(4 * TR, "2026-09-10T03:00:00.000Z"), spend(1 * TR, "2026-09-20T03:00:00.000Z")]);
    expect(env.spent).toBe(5 * TR); // limit axis: the whole month
    expect(env.balance).toBe(6 * TR); // balance axis: only since the anchor
  });

  it("F unfunded: no ledger, spend 1tr → balance null, spendable null, pool unaffected", () => {
    const { f, env } = compose(cfg(food(7 * TR), []), [spend(1 * TR, "2026-09-10T03:00:00.000Z")]);
    expect(env.balance).toBeNull();
    expect(jarSpendable(env.balance)).toBeNull();
    expect(env.source).toBe("mock");
    expect(f.jarEnvelope.pending.allocated).toBe(0);
    expect(f.unallocatedPool.amount).toBe(CASA);
    expect(f.jarBudget.summary.totalBalance).toBeNull();
  });

  it("G withdraw: deposit 7tr, withdraw 2tr, no limit → balance 5tr", () => {
    const config = cfg(food(undefined), [openingDeposit("food", 7 * TR, ANCHOR), entry(2 * TR, "2026-09-05T03:00:00.000Z", "withdraw")]);
    const { budget, env } = compose(config, []);
    expect(env.balance).toBe(5 * TR);
    expect(budget.limitState).toBe("unset");
  });

  it("H past month: viewing Sep while now = 10-05 excludes a ledger row dated 10-02", () => {
    const config = cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR), entry(2 * TR, "2026-10-02T03:00:00.000Z")]);
    const now = new Date("2026-10-05T03:00:00.000Z");
    expect(compose(config, [], "2026-09", now).env.balance).toBe(7 * TR);
    expect(compose(config, [], "2026-10", now).env.balance).toBe(9 * TR);
  });

  it("I zero opening: balance 0 (NOT null), spendable 0; after a 1tr spend → −1tr", () => {
    const config = cfg(food(7 * TR), [openingDeposit("food", 0, ANCHOR)]);
    const empty = compose(config, []);
    expect(empty.env.balance).toBe(0);
    expect(jarSpendable(empty.env.balance)).toBe(0);
    expect(compose(config, [spend(1 * TR, "2026-09-10T03:00:00.000Z")]).env.balance).toBe(-1 * TR);
  });

  it("J template jar (PUT-created, no deposit) → balance null", () => {
    const { env } = compose(cfg(food(7 * TR, "2026-09-12T03:00:00.000Z"), []), []);
    expect(env.balance).toBeNull();
  });

  it("K pre-anchor: Aug view → balance null but spent 2tr/7tr; Aug spend does not reduce Sept", () => {
    const config = cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR)]);
    const txns = [spend(2 * TR, "2026-08-20T03:00:00.000Z")];
    const aug = compose(config, txns, "2026-08");
    expect(aug.env.balance).toBeNull();
    expect(aug.env.spent).toBe(2 * TR);
    expect(aug.env.limit).toBe(7 * TR);
    expect(aug.env.overLimit).toBe(false);
    expect(compose(config, txns, "2026-09").env.balance).toBe(7 * TR);
  });

  it("L one clock: a 1tr deposit stamped transferNow() at 10:30 shows immediately", () => {
    const now = transferNow(new Date("2026-01-01T10:30:00.000Z")); // demo day, 10:30
    const config = cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR), entry(1 * TR, now.toISOString())]);
    expect(compose(config, [], "2026-09", now).env.balance).toBe(8 * TR);
    // The bug the one clock prevents: a 00:00 `DEMO_NOW` read would hide the row.
    expect(compose(config, [], "2026-09", DEMO_NOW).env.balance).toBe(7 * TR);
  });
});

describe("jarBalances — cashflow rules + guards over the anchor window", () => {
  const asOf = balanceAsOf(monthPeriodFromKey("2026-09"), NOW);
  const funded = cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR)]);
  const at = "2026-09-10T03:00:00.000Z";

  it("refund reverses, reversed and pending are excluded", () => {
    const txns = [
      spend(3 * TR, at),
      spend(1 * TR, at, { type: "refund", direction: "credit" }),
      spend(5 * TR, at, { status: "reversed" }),
      spend(4 * TR, at, { status: "pending" }),
    ];
    const facts = jarBalances(funded, txns, asOf).get("food")!;
    expect(facts.spentSinceAnchor).toBe(2 * TR);
    expect(facts.balance).toBe(5 * TR);
  });

  it("anchor falls back to the earliest ledger row; bad rows and foreign jars are ignored", () => {
    const config: JarConfig = {
      version: 3,
      jars: [food(7 * TR, null)],
      ledger: [
        entry(3 * TR, "2026-09-05T03:00:00.000Z"),
        entry(Number.NaN, "2026-09-06T03:00:00.000Z", "deposit", "nan"),
        entry(1 * TR, "not-a-date", "deposit", "bad-date"),
        { ...entry(9 * TR, "2026-09-05T03:00:00.000Z", "deposit", "other"), jarId: "ghost" },
      ],
    };
    const facts = jarBalances(config, [spend(1 * TR, "2026-09-03T03:00:00.000Z"), spend(1 * TR, at)], asOf).get("food")!;
    expect(facts.anchor).toBe("2026-09-05T03:00:00.000Z");
    expect(facts.deposited).toBe(3 * TR);
    expect(facts.balance).toBe(2 * TR); // the 09-03 spend predates the anchor
    expect(jarBalances(config, [], asOf).has("ghost")).toBe(false);
  });

  it("pool identity: pool + Σ spendable = CASA", () => {
    const config: JarConfig = {
      version: 3,
      jars: [food(7 * TR), { id: "fun", label: "Giải trí", categoryIds: ["entertainment"], budgetLimit: 2 * TR, createdAt: ANCHOR }],
      ledger: [openingDeposit("food", 7 * TR, ANCHOR), openingDeposit("fun", 2 * TR, ANCHOR)],
    };
    const { f } = compose(config, [spend(3 * TR, at), txn({ categoryId: "entertainment", amount: 3 * TR, postedAt: at })]);
    const spendable = f.jarEnvelope.jars.reduce((s, l) => s + (jarSpendable(l.balance) ?? 0), 0);
    expect(spendable).toBe(4 * TR); // food 4tr + fun max(0, −1tr)
    expect((f.unallocatedPool.amount as number) + spendable).toBe(CASA);
    expect(f.jarEnvelope.pending.amount).toBe(f.unallocatedPool.amount);
    expect(f.jarBudget.summary.totalBalance).toBe(3 * TR); // 4tr + (−1tr), known lines only
  });

  it("a same-day posting stamped after the clock still reduces the balance (matches `spent` + CASA)", () => {
    const config = cfg(food(7 * TR), [openingDeposit("food", 7 * TR, ANCHOR)]);
    const { env } = compose(config, [spend(1 * TR, "2026-09-15T10:00:00.000Z")], "2026-09", DEMO_NOW); // 00:00 clock
    expect(env.spent).toBe(1 * TR);
    expect(env.balance).toBe(6 * TR);
  });

  it("balanceAsOf = min(period.to, now)", () => {
    const sep = monthPeriodFromKey("2026-09");
    expect(balanceAsOf(sep, NOW)).toBe(NOW.toISOString());
    expect(balanceAsOf(sep, new Date("2026-10-05T00:00:00.000Z"))).toBe(sep.to);
  });
});
