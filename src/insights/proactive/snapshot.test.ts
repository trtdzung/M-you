import { describe, expect, it } from "vitest";
import { buildCustomerSnapshot, type SnapshotOverlay } from "./snapshot";
import type { RawData } from "@/domain/engine/finance-compose";
import { generateDataset } from "@/providers/mock/fixtures/generate";
import { PERSONA_LIST } from "@/providers/mock/personas";
import type { JarConfig, Transaction } from "@/domain/models";
import { REBALANCE_CATEGORY } from "@/domain/models";
import { validAgentSelection } from "./home-contract";
const now = new Date("2026-09-15T00:00:00Z");
const profile: SnapshotOverlay = { assets: [], liabilities: [], goals: [], complete: true };
const noJars: JarConfig = { version: 3, jars: [] };
function raw(): RawData {
  const seed = generateDataset(PERSONA_LIST[0]);
  return { ...seed, transactions: [], liabilities: [], goals: [], budgets: [], snapshots: [] };
}
function txn(id: string, amount: number, postedAt = "2026-09-15T01:00:00Z", over: Partial<Transaction> = {}): Transaction {
  return { id, accountId: "a", postedAt, amount, currency: "VND", direction: "debit", type: "expense",
    categoryId: "dining", merchantName: "Cafe", merchantNormalizedName: "cafe", status: "posted", source: "mock",
    isRecurring: false, userEdited: false, ...over };
}
const make = (r = raw(), p = profile, j = noJars, topups: Transaction[] = []) => buildCustomerSnapshot(r, j, [], p, topups, now);

describe("financial snapshot", () => {
  it("uses VN calendar, excludes future/pending/transfers and nets refunds", () => {
    const s = make({ ...raw(), transactions: [txn("today", 100, "2026-09-14T18:00:00Z"),
      txn("refund", 20, undefined, { type: "refund", direction: "credit" }),
      txn("future", 1000, "2026-09-15T18:00:00Z"), txn("pending", 300, undefined, { status: "pending" }),
      txn("transfer", 400, undefined, { type: "transfer" })] });
    expect(s.cashflow.today.expense).toBe(80);
    expect(s.transactions.some((t) => t.id === "future")).toBe(false);
    expect(JSON.stringify(s.accounts)).not.toMatch(/maskedNumber|accountNumber/);
  });
  it("keeps full aggregates when detailed transaction rows are capped", () => {
    const s = make({ ...raw(), transactions: Array.from({ length: 501 }, (_, i) => txn(`${i}`, 100)) });
    expect(s.transactions).toHaveLength(500);
    expect(s.dataQuality.transactionRowsTruncated).toBe(true);
    expect(s.cashflow.today.expense).toBe(50100);
  });
  it("prioritizes known minimum payments and leaves unknown amounts unknown", () => {
    const base = PERSONA_LIST.flatMap((p) => p.liabilities)[0];
    const s = make({ ...raw(), liabilities: [{ ...base, id: "later", dueDate: "2026-09-22", minimumPayment: 300000 },
      { ...base, id: "first", dueDate: "2026-09-16", minimumPayment: 200000 },
      { ...base, id: "unknown", dueDate: "2026-09-16", minimumPayment: null }] });
    expect(s.candidates[0]).toMatchObject({ id: "payment:next7", metric: { value: 500000 }, facts: { nearest_due: "2026-09-16" } });
    expect(s.payments.find((p) => p.id === "unknown")?.amount).toBeNull();
    expect(s.candidates.some((c) => c.topic === "investment")).toBe(false);
  });
  it("compares month spending against the same elapsed days", () => {
    const s = make({ ...raw(), transactions: [txn("cur", 1000000), txn("prev", 400000, "2026-08-15T00:00:00Z"),
      txn("late", 9000000, "2026-08-20T00:00:00Z")] });
    expect(s.cashflow.previousComparable.expense).toBe(400000);
    expect(s.candidates.some((c) => c.id === "spending:month")).toBe(true);
  });
  it("session topup reduces pool and raises jar balance without adding spending", () => {
    const j = { version: 3, jars: [{ id: "food", label: "Food", categoryIds: ["dining"], budgetLimit: 1000000 }] } as JarConfig;
    const r = { ...raw(), transactions: [txn("spent", 900000)] };
    const before = make(r, profile, j);
    const after = make(r, profile, j, [txn("topup", 200000, undefined, { type: "transfer", categoryId: REBALANCE_CATEGORY,
      rebalance: { fromJarId: "pool", toJarId: "food", origin: "manual", triggerTxnId: "x" } })]);
    expect(after.jars[0].remaining).toBe((before.jars[0].remaining ?? 0) + 200000);
    expect(after.cashflow.monthToDate.expense).toBe(before.cashflow.monthToDate.expense);
    expect(after.unallocated.amount).toBe((before.unallocated.amount as number) - 200000);
  });
  it("only offers investment discovery with conservative reserves and complete profile", () => {
    const r = raw();
    r.accounts = r.accounts.filter((a) => a.type === "current").map((a) => ({ ...a, balance: 100000000, availableBalance: 100000000 }));
    r.transactions = [txn("prev", 1000000, "2026-08-01T00:00:00Z")];
    expect(make(r).candidates.some((c) => c.topic === "investment")).toBe(true);
    expect(make(r, { ...profile, complete: false }).candidates.some((c) => c.topic === "investment")).toBe(false);
    expect(make(r, { ...profile, goals: [{ id: "goal", name: "House", targetAmount: 100000000,
      currentAmount: 0, targetDate: null, source: "self_reported" }] }).candidates.some((c) => c.topic === "investment")).toBe(false);
  });
  it("rejects unknown candidate, downgraded priority, invented numbers and stale snapshot", () => {
    const s = make();
    const candidate = s.candidates[0];
    const value = { candidate_id: candidate.id, snapshot_id: "hash", title: "Xem tiền chưa phân bổ", body: "Cùng chọn ưu tiên." };
    expect(validAgentSelection(value, "hash", s.candidates)).not.toBeNull();
    expect(validAgentSelection({ ...value, title: "Có 10 triệu" }, "hash", s.candidates)).toBeNull();
    expect(validAgentSelection(value, "stale", s.candidates)).toBeNull();
    expect(validAgentSelection({ ...value, candidate_id: "madeup" }, "hash", s.candidates)).toBeNull();
    expect(validAgentSelection(value, "hash", [...s.candidates, { ...candidate, id: "urgent", priority: 0 }])).toBeNull();
  });
});
