import { describe, expect, it } from "vitest";
import type { Account, JarConfig, JarLedgerEntry, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { monthAnchor, openingDeposit } from "@/test-utils/jar-ledger-fixtures";
import {
  casaBalanceOrUnknown,
  computeUnallocatedPool,
  fitsCasaCap,
  jarSpendable,
  jarSpendableTotal,
} from "..";
import { computeFinancials, type RawData } from "../finance-compose";
import { txn } from "./helpers";

/**
 * D26 parity (plan 260923 phase 06): the four surfaces that show "money no jar
 * holds yet" must read ONE number after every kind of write — deposit, withdraw,
 * spend, rebalance:
 *  - overview card "Chờ phân bổ"         → `jarEnvelope.pending.amount`
 *  - AllocationSheet "Còn lại để chia"   → `pending.pool − Σ max(0, line.balance)` at open (nothing added)
 *  - transfer picker "Chưa phân bổ"      → `computeUnallocatedPool` over `jarBudget.lines` spendables
 *  - server CASA cap (`capViolation`)    → `jarSpendableTotal` (pool − total) on the same clock
 * Each derivation below mirrors its consumer's code, so a drift in any one fails here.
 */

const MONTH = "2026-09";
const ANCHOR = monthAnchor(MONTH);
/** The ONE clock: `transferNow()` on the demo day (10:30), which also stamps ledger rows. */
const NOW = new Date("2026-09-15T10:30:00.000Z");
const STAMP = NOW.toISOString();

const JARS: JarConfig["jars"] = [
  { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 3_000_000, createdAt: ANCHOR },
  { id: "bills", label: "Hóa đơn", categoryIds: ["housing"], budgetLimit: 5_000_000, createdAt: ANCHOR },
  // Limit set, never funded → balance `null`, claims nothing from the pool (invariant #6).
  { id: "fresh", label: "Mua sắm", categoryIds: ["shopping"], budgetLimit: 2_000_000, createdAt: ANCHOR },
];

const OPENING: JarLedgerEntry[] = [openingDeposit("food", 3_000_000, ANCHOR), openingDeposit("bills", 5_000_000, ANCHOR)];

function entry(id: string, jarId: string, kind: JarLedgerEntry["kind"], amount: number): JarLedgerEntry {
  return { id, jarId, kind, amount, isOpening: false, createdAt: STAMP, source: "self_reported" };
}

function casa(availableBalance: number): Account[] {
  return [
    {
      id: "cur",
      type: "current",
      institution: "MSB",
      currency: "VND",
      balance: availableBalance,
      availableBalance,
      lastSyncedAt: STAMP,
      source: "msb",
      maskedNumber: "•••• 0000",
      accountNumber: "000000000000",
    },
  ];
}

function leg(fromJarId: string, toJarId: string, amount: number): Transaction {
  return txn({
    type: "transfer",
    categoryId: REBALANCE_CATEGORY,
    amount,
    postedAt: "2026-09-13T03:00:00.000Z",
    rebalance: { fromJarId, toJarId, triggerTxnId: "trigger", origin: "manual" },
  });
}

/** Every surface's number for one state; all must be equal. */
function surfaces(ledger: JarLedgerEntry[], transactions: Transaction[], accounts: Account[]) {
  const config: JarConfig = { version: 3, jars: JARS, ledger };
  const raw: RawData = { transactions, accounts, assets: [], liabilities: [], budgets: [], snapshots: [], goals: [], products: [] };
  const f = computeFinancials(raw, MONTH, { jarConfig: config, now: NOW });
  const { pending } = f.jarEnvelope;

  // AllocationSheet: `balanceByJar` (null → 0), leftToSplit = pool − Σ max(0, balance + 0).
  const balanceByJar = new Map(f.jarEnvelope.jars.map((l) => [l.jarId, l.balance ?? 0]));
  const sheet = (pending.pool as number) - JARS.reduce((s, j) => s + Math.max(0, balanceByJar.get(j.id) ?? 0), 0);
  // TransferCompose: the picker pool from the jar-budget lines' spendables.
  const picker = computeUnallocatedPool({
    casaBalance: casaBalanceOrUnknown(accounts),
    spendableTotal: f.jarBudget.lines.reduce((s, l) => s + (jarSpendable(l.balance) ?? 0), 0),
  }).amount;
  // Server guard: the cap's own totals on the same clock.
  const server = jarSpendableTotal(config, accounts, transactions, NOW);

  return {
    card: pending.amount,
    sheet,
    picker,
    financials: f.unallocatedPool.amount,
    cap: (server.pool as number) - server.total,
    serverPool: server.pool,
    serverTotal: server.total,
    balances: Object.fromEntries(f.jarBudget.lines.map((l) => [l.huId, l.balance])),
  };
}

function expectOneNumber(s: ReturnType<typeof surfaces>, expected: number, casaNow: number) {
  expect(s.card).toBe(expected);
  expect(s.sheet).toBe(expected);
  expect(s.picker).toBe(expected);
  expect(s.financials).toBe(expected);
  expect(s.cap).toBe(expected);
  // C1 identity on the server's numbers: pool + Σ spendable = CASA.
  expect(s.serverPool).toBe(casaNow);
  expect(expected + s.serverTotal).toBe(casaNow);
  // The cap admits a deposit of exactly the shown pool and refuses one VND more.
  expect(fitsCasaCap(s.serverTotal + expected, s.serverTotal, s.serverPool).ok).toBe(true);
  expect(fitsCasaCap(s.serverTotal + expected + 1, s.serverTotal, s.serverPool)).toEqual({ ok: false, overBy: 1 });
}

describe("D26 parity — card, allocation sheet, picker and server cap read one unallocated number", () => {
  const deposit = entry("led-dep", "food", "deposit", 1_000_000);
  const withdraw = entry("led-wd", "bills", "withdraw", 2_000_000);
  const spends = [
    txn({ categoryId: "dining", amount: 1_500_000, postedAt: "2026-09-10T03:00:00.000Z" }),
    txn({ categoryId: "housing", amount: 4_000_000, postedAt: "2026-09-12T03:00:00.000Z" }),
  ];

  it("opening balances only: CASA 20tr − (3tr + 5tr) = 12tr; the unfunded jar claims nothing", () => {
    const s = surfaces(OPENING, [], casa(20_000_000));
    expect(s.balances).toEqual({ food: 3_000_000, bills: 5_000_000, fresh: null });
    expectOneNumber(s, 12_000_000, 20_000_000);
  });

  it("after a deposit stamped on the same clock (10:30 on the demo day): 11tr", () => {
    const s = surfaces([...OPENING, deposit], [], casa(20_000_000));
    expect(s.balances.food).toBe(4_000_000); // visible immediately (Red Team #1)
    expectOneNumber(s, 11_000_000, 20_000_000);
  });

  it("after a withdraw back to the pool: 13tr", () => {
    const s = surfaces([...OPENING, deposit, withdraw], [], casa(20_000_000));
    expect(s.balances.bills).toBe(3_000_000);
    expectOneNumber(s, 13_000_000, 20_000_000);
  });

  it("after spend (CASA debited 5.5tr; bills overdrawn → spendable floored at 0): 12tr", () => {
    const s = surfaces([...OPENING, deposit, withdraw], spends, casa(14_500_000));
    expect(s.balances).toEqual({ food: 2_500_000, bills: -1_000_000, fresh: null });
    expectOneNumber(s, 14_500_000 - 2_500_000, 14_500_000);
  });

  it("after rebalance (food → bills 1tr, pool → bills 500k): 12.5tr", () => {
    const txns = [...spends, leg("food", "bills", 1_000_000), leg("pool", "bills", 500_000)];
    const s = surfaces([...OPENING, deposit, withdraw], txns, casa(14_500_000));
    expect(s.balances).toEqual({ food: 1_500_000, bills: 500_000, fresh: null });
    expectOneNumber(s, 14_500_000 - 2_000_000, 14_500_000);
  });
});
