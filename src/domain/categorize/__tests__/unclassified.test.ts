import { describe, expect, it } from "vitest";
import { isUnclassified } from "../unclassified";
import { txn } from "@/domain/engine/__tests__/helpers";
import { aggregateCashflow } from "@/domain/engine/cashflow";
import { spendingByCategory } from "@/domain/engine/category";
import type { Period } from "@/domain/engine/types";
import { generateDataset } from "@/providers/mock/fixtures/generate";
import { PERSONAS } from "@/providers/mock/personas";
import { UNCLASSIFIED, UNCLASSIFIED_LABEL } from "@/domain/models";

describe("isUnclassified (type gate — Red Team #4)", () => {
  it("is true for an unclassified expense or income", () => {
    expect(isUnclassified(txn({ categoryId: UNCLASSIFIED, type: "expense" }))).toBe(true);
    expect(isUnclassified(txn({ categoryId: UNCLASSIFIED, type: "income" }))).toBe(true);
  });

  it("is false for structural types even when unlabelled", () => {
    for (const type of ["transfer", "card_payment", "fee", "refund"] as const) {
      expect(isUnclassified(txn({ categoryId: UNCLASSIFIED, type }))).toBe(false);
    }
  });

  it("is false for a labelled transaction", () => {
    expect(isUnclassified(txn({ categoryId: "dining", type: "expense" }))).toBe(false);
  });
});

describe("mock generator ships unclassified transactions (Red Team #1)", () => {
  it("produces >0 unclassified expenses for every persona, deterministically", () => {
    for (const persona of Object.values(PERSONAS)) {
      const a = generateDataset(persona);
      const b = generateDataset(persona);
      const countA = a.transactions.filter((t) => t.categoryId === UNCLASSIFIED).length;
      expect(countA).toBeGreaterThan(0);
      // deterministic: same seed ⇒ same unclassified set
      expect(a.transactions).toEqual(b.transactions);
    }
  });

  it("keeps unclassified txns as valid expenses with a real merchant signal", () => {
    const ds = generateDataset(PERSONAS.stable);
    const uncl = ds.transactions.filter((t) => t.categoryId === UNCLASSIFIED);
    expect(uncl.every((t) => t.type === "expense")).toBe(true);
    expect(uncl.every((t) => t.merchantNormalizedName.length > 0)).toBe(true);
  });
});

describe("engine tolerates UNCLASSIFIED without defaulting to 0 (invariant #6)", () => {
  const period: Period = { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z", label: "all" };

  it("counts unclassified spend in total expense AND surfaces it as its own bucket", () => {
    const txns = [
      txn({ id: "a", categoryId: "dining", type: "expense", amount: 100 }),
      txn({ id: "b", categoryId: UNCLASSIFIED, type: "expense", amount: 40 }),
    ];
    const cf = aggregateCashflow(txns, period);
    expect(cf.expense).toBe(140); // unclassified money is NOT dropped from the total
    const rows = spendingByCategory(txns, period);
    const unclRow = rows.find((r) => r.categoryId === UNCLASSIFIED);
    expect(unclRow?.amount).toBe(40);
    expect(unclRow?.label).toBe(UNCLASSIFIED_LABEL);
  });
});
