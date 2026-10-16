import { describe, expect, it } from "vitest";
import type { Account, JarConfig } from "@/domain/models";
import {
  evaluateJarPartition,
  resolveAllocation,
  resolvePrimaryAccount,
  resolvePrimaryBalance,
  validateJarInput,
} from "../jars";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);
const MAY = monthPeriod(2026, 4); // previous period (for MoM)

const cfg = (jars: JarConfig["jars"]): JarConfig => ({ version: 2, jars });

function acct(over: Partial<Account> = {}): Account {
  return {
    id: over.id ?? "acc_current",
    type: over.type ?? "current",
    institution: "MSB",
    currency: "VND",
    balance: over.balance ?? 10_000_000,
    availableBalance: over.availableBalance ?? over.balance ?? 10_000_000,
    lastSyncedAt: over.lastSyncedAt ?? "2026-09-15T00:00:00.000Z",
    source: over.source ?? "msb",
    maskedNumber: "•••• 1991",
  };
}

/** Every partition result must satisfy the hard identity Σ earmark ≡ balance. */
function expectIdentity(result: ReturnType<typeof evaluateJarPartition>, balance: number) {
  expect(result.status).toBe("ok");
  expect(result.primaryBalance).toBe(balance);
  const sum = result.lines.reduce((s, l) => s + l.earmark, 0);
  expect(sum).toBe(balance);
  expect(result.total).toBe(balance);
}

describe("resolvePrimaryAccount / resolvePrimaryBalance", () => {
  it("resolves the single current account", () => {
    const accounts = [acct({ id: "c", balance: 5_000_000 }), acct({ id: "s", type: "savings" })];
    expect(resolvePrimaryAccount(accounts)?.id).toBe("c");
    expect(resolvePrimaryBalance(accounts)).toBe(5_000_000);
  });

  it("is unknown with 0 current accounts (never a silent 0)", () => {
    const accounts = [acct({ id: "s", type: "savings" })];
    expect(resolvePrimaryAccount(accounts)).toBeNull();
    expect(resolvePrimaryBalance(accounts)).toBe("unknown");
  });

  it("is unknown with 2+ current accounts (never first-match)", () => {
    const accounts = [acct({ id: "c1" }), acct({ id: "c2" })];
    expect(resolvePrimaryAccount(accounts)).toBeNull();
    expect(resolvePrimaryBalance(accounts)).toBe("unknown");
  });
});

describe("resolveAllocation", () => {
  it("percent → rounded share of the balance; amount → the fixed value", () => {
    expect(resolveAllocation({ id: "j", label: "", categoryIds: [], allocation: { mode: "percent", value: 30 } }, 10_000_000)).toBe(3_000_000);
    expect(resolveAllocation({ id: "j", label: "", categoryIds: [], allocation: { mode: "amount", value: 2_000_000 } }, 10_000_000)).toBe(2_000_000);
  });

  it("rounds a fractional percent share to whole VND", () => {
    // 50% of 3 = 1.5 → 2
    expect(resolveAllocation({ id: "j", label: "", categoryIds: [], allocation: { mode: "percent", value: 50 } }, 3)).toBe(2);
  });
});

describe("evaluateJarPartition — identity + per-jar values (hard gate)", () => {
  it("[normal] earmarks, spend overlay, and residual all hand-verified", () => {
    const result = evaluateJarPartition(
      cfg([
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } },
        { id: "shop", label: "Mua sắm", categoryIds: ["shopping"], allocation: { mode: "amount", value: 2_000_000 } },
      ]),
      acct({ balance: 10_000_000 }),
      [
        txn({ categoryId: "dining", amount: 1_000_000 }),
        txn({ categoryId: "shopping", amount: 2_500_000 }),
      ],
      JUNE,
      MAY,
    );
    expectIdentity(result, 10_000_000);

    const [food, shop, residual] = result.lines;
    expect(food.earmark).toBe(3_000_000); // 30% of 10M
    expect(food.spentThisPeriod).toBe(1_000_000);
    expect(food.isOverBudget).toBe(false);

    expect(shop.earmark).toBe(2_000_000);
    expect(shop.spentThisPeriod).toBe(2_500_000);
    expect(shop.isOverBudget).toBe(true); // 2.5M > 2M chia → budget breach

    expect(residual.isResidual).toBe(true);
    expect(residual.label).toBe("Chưa phân bổ");
    expect(residual.earmark).toBe(5_000_000); // 10M − (3M + 2M)
    expect(residual.isOverAllocated).toBe(false);
  });

  it("[over-allocated] residual goes negative and is flagged; identity still holds", () => {
    const result = evaluateJarPartition(
      cfg([
        { id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "percent", value: 80 } },
        { id: "b", label: "B", categoryIds: ["shopping"], allocation: { mode: "amount", value: 5_000_000 } },
      ]),
      acct({ balance: 10_000_000 }),
      [],
      JUNE,
      MAY,
    );
    expectIdentity(result, 10_000_000);
    const residual = result.lines.find((l) => l.isResidual)!;
    expect(residual.earmark).toBe(-3_000_000); // 10M − (8M + 5M)
    expect(residual.isOverAllocated).toBe(true);
  });

  it("[over-budget] a jar whose period spend exceeds its earmark", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "amount", value: 1_000_000 } }]),
      acct({ balance: 10_000_000 }),
      [txn({ categoryId: "dining", amount: 1_500_000 })],
      JUNE,
      MAY,
    );
    const jar = result.lines[0];
    expect(jar.spentThisPeriod).toBe(1_500_000);
    expect(jar.earmark).toBe(1_000_000);
    expect(jar.isOverBudget).toBe(true);
  });

  it("[unassigned category] spend outside any jar is not attributed; identity holds", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "amount", value: 2_000_000 } }]),
      acct({ balance: 10_000_000 }),
      [
        txn({ categoryId: "dining", amount: 1_000_000 }),
        txn({ categoryId: "shopping", amount: 3_000_000 }), // in no jar
      ],
      JUNE,
      MAY,
    );
    expectIdentity(result, 10_000_000);
    expect(result.lines[0].spentThisPeriod).toBe(1_000_000); // only its own category
    expect(result.lines.every((l) => !l.categoryIds.includes("shopping"))).toBe(true);
  });

  it("[rounding] the residual absorbs the remainder so the total is exact", () => {
    // 3 jars × 33% of 100 = round(33) = 33 each → 99; residual = 1
    const result = evaluateJarPartition(
      cfg([
        { id: "a", label: "A", categoryIds: [], allocation: { mode: "percent", value: 33 } },
        { id: "b", label: "B", categoryIds: [], allocation: { mode: "percent", value: 33 } },
        { id: "c", label: "C", categoryIds: [], allocation: { mode: "percent", value: 33 } },
      ]),
      acct({ balance: 100 }),
      [],
      JUNE,
      MAY,
    );
    expectIdentity(result, 100);
    expect(result.lines.slice(0, 3).map((l) => l.earmark)).toEqual([33, 33, 33]);
    expect(result.lines.find((l) => l.isResidual)!.earmark).toBe(1);
  });

  it("[empty config] a single residual line equal to the full balance", () => {
    const result = evaluateJarPartition(cfg([]), acct({ balance: 7_000_000 }), [], JUNE, MAY);
    expectIdentity(result, 7_000_000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].isResidual).toBe(true);
    expect(result.lines[0].earmark).toBe(7_000_000);
  });

  it("[pending excluded] pending spend does not count toward the overlay", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "amount", value: 5_000_000 } }]),
      acct({ balance: 10_000_000 }),
      [
        txn({ categoryId: "dining", amount: 1_000_000 }),
        txn({ categoryId: "dining", status: "pending", amount: 9_000_000 }),
      ],
      JUNE,
      MAY,
    );
    expect(result.lines[0].spentThisPeriod).toBe(1_000_000);
  });

  it("[refund reversed] a refund nets out of the overlay", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["shopping"], allocation: { mode: "amount", value: 5_000_000 } }]),
      acct({ balance: 10_000_000 }),
      [
        txn({ categoryId: "shopping", type: "expense", amount: 1_500_000 }),
        txn({ categoryId: "shopping", type: "refund", direction: "credit", amount: 500_000 }),
      ],
      JUNE,
      MAY,
    );
    expect(result.lines[0].spentThisPeriod).toBe(1_000_000);
  });

  it("[transfer excluded] an internal transfer is not spend", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "amount", value: 5_000_000 } }]),
      acct({ balance: 10_000_000 }),
      [
        txn({ categoryId: "dining", type: "expense", amount: 1_000_000 }),
        txn({ categoryId: "dining", type: "transfer", amount: 9_000_000 }),
      ],
      JUNE,
      MAY,
    );
    expect(result.lines[0].spentThisPeriod).toBe(1_000_000);
  });

  it("[MoM] previous-period spend is reported separately for the delta", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "amount", value: 5_000_000 } }]),
      acct({ balance: 10_000_000 }),
      [
        txn({ categoryId: "dining", amount: 1_000_000, postedAt: "2026-06-10T00:00:00.000Z" }),
        txn({ categoryId: "dining", amount: 2_000_000, postedAt: "2026-05-10T00:00:00.000Z" }),
      ],
      JUNE,
      MAY,
    );
    expect(result.lines[0].spentThisPeriod).toBe(1_000_000);
    expect(result.lines[0].spentPrevPeriod).toBe(2_000_000);
  });

  it("[unknown] 0 current accounts → no lines, balance null, never 0", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } }]),
      resolvePrimaryAccount([acct({ type: "savings" })]),
      [],
      JUNE,
      MAY,
    );
    expect(result.status).toBe("unknown");
    expect(result.primaryBalance).toBeNull();
    expect(result.lines).toEqual([]);
  });

  it("[unknown] 2+ current accounts → unknown", () => {
    const result = evaluateJarPartition(
      cfg([]),
      resolvePrimaryAccount([acct({ id: "c1" }), acct({ id: "c2" })]),
      [],
      JUNE,
      MAY,
    );
    expect(result.status).toBe("unknown");
  });

  it("residual provenance is the primary account's own source/freshness only", () => {
    const result = evaluateJarPartition(
      cfg([{ id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } }]),
      acct({ balance: 10_000_000, source: "msb", lastSyncedAt: "2026-09-15T00:00:00.000Z" }),
      [txn({ categoryId: "dining", amount: 1_000_000, source: "mock" })],
      JUNE,
      MAY,
    );
    const residual = result.lines.find((l) => l.isResidual)!;
    expect(residual.meta.source).toBe("msb"); // account, NOT folded from the mock txn
    expect(residual.meta.freshness).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("validateJarInput (M8 — never NaN/negative/huge into the engine)", () => {
  it("accepts a valid percent and a valid amount", () => {
    expect(validateJarInput("65", "percent")).toEqual({ ok: true, value: 65, error: null });
    expect(validateJarInput("1500000", "amount")).toEqual({ ok: true, value: 1_500_000, error: null });
    expect(validateJarInput("0", "percent")).toEqual({ ok: true, value: 0, error: null });
  });

  it("rejects blank, non-numeric, non-finite, negative, and percent > 100", () => {
    expect(validateJarInput("", "percent").ok).toBe(false);
    expect(validateJarInput("abc", "percent").ok).toBe(false);
    expect(validateJarInput("Infinity", "amount").ok).toBe(false);
    expect(validateJarInput("-5", "percent").ok).toBe(false);
    expect(validateJarInput("150", "percent").ok).toBe(false);
    expect(validateJarInput("150", "amount")).toEqual({ ok: true, value: 150, error: null });
  });

  it("never returns a NaN value on rejection", () => {
    const res = validateJarInput("not-a-number", "amount");
    expect(res.value).toBeNull();
  });
});
