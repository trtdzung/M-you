import { describe, expect, it } from "vitest";
import type { Account, JarConfig } from "@/domain/models";
import {
  categoryToJarMap,
  duplicateCategoryIds,
  groupSpendingByJar,
  jarChipList,
  KHAC_JAR_ID,
} from "../category-jars";
import { spendingByCategory } from "../category";
import { evaluateJarPartition } from "../jars";
import { monthPeriod } from "../types";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);
const MAY = monthPeriod(2026, 4);

const cfg = (jars: JarConfig["jars"]): JarConfig => ({ version: 2, jars });

/** A few expense transactions across categories, all posted in June. */
const spend = [
  txn({ categoryId: "dining", amount: 2_000_000 }),
  txn({ categoryId: "groceries", amount: 1_000_000 }),
  txn({ categoryId: "transport", amount: 500_000 }),
  txn({ categoryId: "housing", amount: 4_000_000 }),
  txn({ categoryId: "entertainment", amount: 300_000 }),
];

function acct(over: Partial<Account> = {}): Account {
  return {
    id: over.id ?? "acc_current",
    type: over.type ?? "current",
    institution: "MSB",
    currency: "VND",
    balance: over.balance ?? 20_000_000,
    availableBalance: over.availableBalance ?? over.balance ?? 20_000_000,
    lastSyncedAt: "2026-09-15T00:00:00.000Z",
    source: over.source ?? "msb",
    maskedNumber: "•••• 1991",
  };
}

describe("categoryToJarMap / duplicateCategoryIds", () => {
  it("maps each category to its jar (first-wins on overlap)", () => {
    const config = cfg([
      { id: "a", label: "A", categoryIds: ["dining", "groceries"], allocation: { mode: "percent", value: 20 } },
      { id: "b", label: "B", categoryIds: ["dining", "transport"], allocation: { mode: "percent", value: 10 } },
    ]);
    const map = categoryToJarMap(config);
    expect(map.get("dining")).toBe("a"); // first jar keeps it
    expect(map.get("groceries")).toBe("a");
    expect(map.get("transport")).toBe("b");
    expect(duplicateCategoryIds(config)).toEqual(["dining"]);
  });

  it("reports no duplicates for the default template", () => {
    expect(duplicateCategoryIds(DEFAULT_JAR_CONFIG)).toEqual([]);
  });
});

describe("groupSpendingByJar — total conservation", () => {
  it("Σ group.amount === Σ spendingByCategory.amount (100% of period spend)", () => {
    const groups = groupSpendingByJar(DEFAULT_JAR_CONFIG, spend, JUNE);
    const groupTotal = groups.reduce((s, g) => s + g.amount, 0);
    const catTotal = spendingByCategory(spend, JUNE).reduce((s, c) => s + c.amount, 0);
    expect(groupTotal).toBe(catTotal);
    expect(catTotal).toBe(7_800_000);
  });

  it("shares sum to ~1 over a non-empty period", () => {
    const groups = groupSpendingByJar(DEFAULT_JAR_CONFIG, spend, JUNE);
    const shareSum = groups.reduce((s, g) => s + g.share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
  });

  it("default template produces no orphan group (0 Khác)", () => {
    const groups = groupSpendingByJar(DEFAULT_JAR_CONFIG, spend, JUNE);
    expect(groups.some((g) => g.jarId === KHAC_JAR_ID)).toBe(false);
  });
});

describe("groupSpendingByJar — orphan handling", () => {
  it("routes an unmapped expense category to Khác (pinned last)", () => {
    // A config that leaves `entertainment` in no jar → it must land in Khác.
    const config = cfg([
      { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"], allocation: { mode: "percent", value: 30 } },
      { id: "home", label: "Nhà", categoryIds: ["housing"], allocation: { mode: "percent", value: 40 } },
      { id: "move", label: "Đi lại", categoryIds: ["transport"], allocation: { mode: "percent", value: 10 } },
    ]);
    const groups = groupSpendingByJar(config, spend, JUNE);
    const khac = groups.find((g) => g.jarId === KHAC_JAR_ID);
    expect(khac).toBeDefined();
    expect(khac?.amount).toBe(300_000); // entertainment
    expect(groups[groups.length - 1].jarId).toBe(KHAC_JAR_ID); // always last
    // Still 100% of period spend.
    expect(groups.reduce((s, g) => s + g.amount, 0)).toBe(7_800_000);
  });

  it("does not double-count a category listed by two jars (first-wins)", () => {
    const config = cfg([
      { id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "percent", value: 20 } },
      { id: "b", label: "B", categoryIds: ["dining"], allocation: { mode: "percent", value: 20 } },
    ]);
    const groups = groupSpendingByJar(config, spend, JUNE);
    const a = groups.find((g) => g.jarId === "a");
    const b = groups.find((g) => g.jarId === "b");
    expect(a?.amount).toBe(2_000_000); // dining once, on the first jar
    expect(b).toBeUndefined(); // second jar has no spend of its own
  });
});

describe("groupSpendingByJar — empty period", () => {
  it("returns [] (no NaN share) when nothing was spent", () => {
    const groups = groupSpendingByJar(DEFAULT_JAR_CONFIG, [], JUNE);
    expect(groups).toEqual([]);
  });

  it("returns [] for a period with no matching transactions", () => {
    const groups = groupSpendingByJar(DEFAULT_JAR_CONFIG, spend, MAY);
    expect(groups).toEqual([]);
  });
});

describe("jarChipList", () => {
  it("keeps a zero-spend jar's chip (savings) and adds no Khác for full coverage", () => {
    const chips = jarChipList(DEFAULT_JAR_CONFIG);
    expect(chips.some((c) => c.jarId === "savings")).toBe(true); // 0-category jar still chipped
    expect(chips.some((c) => c.jarId === KHAC_JAR_ID)).toBe(false); // template covers all expenses
  });

  it("adds a trailing Khác chip when some expense category is unmapped", () => {
    const config = cfg([
      { id: "a", label: "A", categoryIds: ["dining"], allocation: { mode: "percent", value: 20 } },
    ]);
    const chips = jarChipList(config);
    expect(chips[chips.length - 1].jarId).toBe(KHAC_JAR_ID);
  });
});

describe("parity with evaluateJarPartition (red-team #9)", () => {
  it("per-jar group amount === partition spentThisPeriod for the default template", () => {
    const groups = groupSpendingByJar(DEFAULT_JAR_CONFIG, spend, JUNE);
    const byJar = new Map(groups.map((g) => [g.jarId, g.amount]));
    const partition = evaluateJarPartition(DEFAULT_JAR_CONFIG, acct(), spend, JUNE, MAY);

    for (const line of partition.lines) {
      if (line.isResidual) continue; // residual has no categories / spend
      const groupAmount = byJar.get(line.jarId) ?? 0; // 0-spend jars dropped from chart data
      expect(groupAmount).toBe(line.spentThisPeriod);
    }
  });
});
