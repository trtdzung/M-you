import { describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { evaluateJars, resolveIncomeBasis, validateJarInput, type IncomeBasis } from "../jars";
import type { RecurringSeries } from "../recurring";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);
const NOW = new Date("2026-06-20T00:00:00.000Z"); // 11 days left in June

const KNOWN = (value: number, over: Partial<IncomeBasis> = {}): IncomeBasis => ({
  value,
  source: over.source ?? "msb",
  freshness: over.freshness ?? "2026-06-05T00:00:00.000Z",
});
const UNKNOWN_INCOME: IncomeBasis = { value: "unknown", source: "estimated", freshness: null };

const cfg = (jars: JarConfig["jars"], incomeBasis: JarConfig["incomeBasis"] = "auto"): JarConfig => ({
  version: 1,
  jars,
  incomeBasis,
});

describe("evaluateJars", () => {
  it("returns no lines when the config has no jars", () => {
    expect(evaluateJars(cfg([]), [txn({ categoryId: "dining", amount: 9_000_000 })], JUNE, NOW, UNKNOWN_INCOME)).toEqual([]);
  });

  it("computes percent-mode allocation from a known income", () => {
    const [line] = evaluateJars(
      cfg([{ id: "j1", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } }]),
      [txn({ categoryId: "dining", amount: 3_000_000 })],
      JUNE,
      NOW,
      KNOWN(20_000_000),
    );
    expect(line.allocated).toBe(6_000_000); // 30% of 20M
    expect(line.used).toBe(3_000_000);
    expect(line.pct).toBeCloseTo(0.5);
    expect(line.status).toBe("ok");
    expect(line.daysLeft).toBe(11);
  });

  it("uses a fixed VND cap for amount-mode jars, ignoring income", () => {
    const [line] = evaluateJars(
      cfg([{ id: "j1", label: "Mua sắm", categoryIds: ["shopping"], allocation: { mode: "amount", value: 4_000_000 } }]),
      [txn({ categoryId: "shopping", amount: 2_000_000 })],
      JUNE,
      NOW,
      UNKNOWN_INCOME, // amount mode is unaffected by unknown income
    );
    expect(line.allocated).toBe(4_000_000);
    expect(line.pct).toBeCloseTo(0.5);
    expect(line.status).toBe("ok");
  });

  it("classifies near and over against the allocation", () => {
    const lines = evaluateJars(
      cfg([
        { id: "near", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } },
        { id: "over", label: "Di chuyển", categoryIds: ["transport"], allocation: { mode: "amount", value: 1_000_000 } },
      ]),
      [
        txn({ categoryId: "dining", amount: 2_700_000 }), // 90% of 3M -> near
        txn({ categoryId: "transport", amount: 1_200_000 }), // 120% -> over
      ],
      JUNE,
      NOW,
      KNOWN(10_000_000), // dining allocated = 3M
    );
    const byId = Object.fromEntries(lines.map((l) => [l.jarId, l]));
    expect(byId.near.status).toBe("near");
    expect(byId.over.status).toBe("over");
  });

  it("[C1] never manufactures a healthy verdict when income is unknown", () => {
    const [line] = evaluateJars(
      cfg([{ id: "j1", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } }]),
      [txn({ categoryId: "dining", amount: 3_000_000 })],
      JUNE,
      NOW,
      UNKNOWN_INCOME,
    );
    expect(line.allocated).toBeNull();
    expect(line.pct).toBeNull();
    expect(line.status).toBe("unknown");
    expect(line.used).toBe(3_000_000); // used is always the real posted spend
  });

  it("reverses refunds out of the used amount (spend rule)", () => {
    const [line] = evaluateJars(
      cfg([{ id: "j1", label: "Mua sắm", categoryIds: ["shopping"], allocation: { mode: "amount", value: 2_000_000 } }]),
      [
        txn({ categoryId: "shopping", type: "expense", amount: 1_500_000 }),
        txn({ categoryId: "shopping", type: "refund", direction: "credit", amount: 500_000 }),
      ],
      JUNE,
      NOW,
      UNKNOWN_INCOME,
    );
    expect(line.used).toBe(1_000_000);
  });

  it("excludes transfers from jar spend (AD1)", () => {
    const [line] = evaluateJars(
      cfg([{ id: "j1", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "amount", value: 5_000_000 } }]),
      [
        txn({ categoryId: "dining", type: "expense", amount: 1_000_000 }),
        txn({ categoryId: "dining", type: "transfer", amount: 9_000_000 }), // excluded
      ],
      JUNE,
      NOW,
      UNKNOWN_INCOME,
    );
    expect(line.used).toBe(1_000_000);
  });

  it("surfaces uncovered spend as a neutral 'Chưa phân hũ' line, never dropped", () => {
    const lines = evaluateJars(
      cfg([{ id: "j1", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "amount", value: 2_000_000 } }]),
      [
        txn({ categoryId: "dining", amount: 1_000_000 }),
        txn({ categoryId: "shopping", amount: 2_000_000 }), // in no jar
      ],
      JUNE,
      NOW,
      UNKNOWN_INCOME,
    );
    const unassigned = lines.find((l) => l.isUnassigned);
    expect(unassigned).toBeDefined();
    expect(unassigned!.jarId).toBe("unassigned");
    expect(unassigned!.categoryIds).toEqual(["shopping"]);
    expect(unassigned!.used).toBe(2_000_000);
    expect(unassigned!.allocated).toBeNull();
    expect(unassigned!.status).toBe("unknown");
  });

  it("omits the unassigned line when every category with spend is covered", () => {
    const lines = evaluateJars(
      cfg([{ id: "j1", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "amount", value: 2_000_000 } }]),
      [txn({ categoryId: "dining", amount: 1_000_000 })],
      JUNE,
      NOW,
      UNKNOWN_INCOME,
    );
    expect(lines.some((l) => l.isUnassigned)).toBe(false);
  });

  it("[H4] folds the income source into a percent jar's provenance but not an amount jar's", () => {
    const income = KNOWN(10_000_000, { source: "self_reported", freshness: "2026-06-01T00:00:00.000Z" });
    const txns = [txn({ categoryId: "dining", source: "msb", postedAt: "2026-06-20T00:00:00.000Z", amount: 1_000_000 })];

    const [percent] = evaluateJars(
      cfg([{ id: "p", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "percent", value: 30 } }]),
      txns,
      JUNE,
      NOW,
      income,
    );
    // worst-case source is self_reported (income), oldest freshness is the income's
    expect(percent.meta.source).toBe("self_reported");
    expect(percent.meta.freshness).toBe("2026-06-01T00:00:00.000Z");

    const [amount] = evaluateJars(
      cfg([{ id: "a", label: "Ăn uống", categoryIds: ["dining"], allocation: { mode: "amount", value: 5_000_000 } }]),
      txns,
      JUNE,
      NOW,
      income,
    );
    // income never feeds an amount jar → provenance is the transaction's only
    expect(amount.meta.source).toBe("msb");
    expect(amount.meta.freshness).toBe("2026-06-20T00:00:00.000Z");
  });
});

describe("resolveIncomeBasis (salary → manual → unknown)", () => {
  const salarySeries: RecurringSeries = {
    merchantNormalizedName: "cong ty",
    label: "Công ty",
    categoryId: "salary",
    direction: "credit",
    occurrences: 3,
    distinctMonths: 3,
    averageAmount: 25_000_000,
    averageDayOfMonth: 5,
    lastPostedAt: "2026-06-05T00:00:00.000Z",
    isExpense: false,
  };

  it("prefers a detected recurring salary, folding its transactions' provenance", () => {
    const raw = {
      transactions: [
        txn({ merchantNormalizedName: "cong ty", direction: "credit", type: "income", categoryId: "salary", source: "msb" }),
      ],
    };
    const basis = resolveIncomeBasis(cfg([], 99), raw, [salarySeries]);
    expect(basis.value).toBe(25_000_000); // detected salary wins over the manual number
    expect(basis.source).toBe("msb");
    expect(basis.freshness).toBe("2026-06-05T00:00:00.000Z");
  });

  it("falls back to a manual override number when no salary is detected", () => {
    const basis = resolveIncomeBasis(cfg([], 18_000_000), { transactions: [] }, []);
    expect(basis.value).toBe(18_000_000);
    expect(basis.source).toBe("self_reported");
    expect(basis.freshness).toBeNull();
  });

  it("reports unknown when auto with no salary detected (first-run default)", () => {
    const basis = resolveIncomeBasis(cfg([], "auto"), { transactions: [] }, []);
    expect(basis.value).toBe("unknown");
    expect(basis.source).toBe("estimated");
    expect(basis.freshness).toBeNull();
  });
});

describe("validateJarInput (M8 — never NaN/negative/huge into the engine)", () => {
  it("accepts a valid percent and a valid amount", () => {
    expect(validateJarInput("65", "percent")).toEqual({ ok: true, value: 65, error: null });
    expect(validateJarInput("1500000", "amount")).toEqual({ ok: true, value: 1_500_000, error: null });
    expect(validateJarInput("0", "percent")).toEqual({ ok: true, value: 0, error: null });
  });

  it("rejects blank and non-numeric input", () => {
    expect(validateJarInput("", "percent").ok).toBe(false);
    expect(validateJarInput("   ", "amount").ok).toBe(false);
    expect(validateJarInput("abc", "percent").ok).toBe(false);
  });

  it("rejects non-finite and negative values", () => {
    expect(validateJarInput("Infinity", "amount").ok).toBe(false);
    expect(validateJarInput("NaN", "amount").ok).toBe(false);
    expect(validateJarInput("-5", "percent").ok).toBe(false);
  });

  it("rejects a percent over 100 but accepts the same value as an amount", () => {
    expect(validateJarInput("150", "percent").ok).toBe(false);
    expect(validateJarInput("150", "amount")).toEqual({ ok: true, value: 150, error: null });
  });

  it("never returns a NaN value on rejection", () => {
    const res = validateJarInput("not-a-number", "amount");
    expect(res.value).toBeNull();
    expect(Number.isNaN(res.value as unknown as number)).toBe(false);
  });
});
