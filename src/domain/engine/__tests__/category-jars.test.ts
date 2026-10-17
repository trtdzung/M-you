import { describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import {
  categoryToJarMap,
  duplicateCategoryIds,
  groupSpendingByJar,
  jarChipList,
  orphanExpenseCategoryIds,
  KHAC_JAR_ID,
} from "../category-jars";
import { spendingByCategory } from "../category";
import { monthPeriod } from "../types";
import { BUILT_IN_EXPENSE_IDS, DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { txn } from "./helpers";

const JUNE = monthPeriod(2026, 5);
const MAY = monthPeriod(2026, 4);

const cfg = (jars: JarConfig["jars"]): JarConfig => ({ version: 3, jars });

describe("orphanExpenseCategoryIds — the exactly-one heal source", () => {
  it("returns every expense category no jar claims (config order)", () => {
    const partial = cfg([
      { id: "a", label: "A", categoryIds: ["dining", "groceries"] },
    ]);
    const orphans = orphanExpenseCategoryIds(partial, BUILT_IN_EXPENSE_IDS);
    expect(orphans).toContain("housing");
    expect(orphans).not.toContain("dining");
    expect(orphans).not.toContain("salary"); // income is not an expense category
  });

  it("is empty when every expense category is covered (all templates are)", () => {
    expect(orphanExpenseCategoryIds(DEFAULT_JAR_CONFIG, BUILT_IN_EXPENSE_IDS)).toEqual([]);
  });
});

/** A few expense transactions across categories, all posted in June. */
const spend = [
  txn({ categoryId: "dining", amount: 2_000_000 }),
  txn({ categoryId: "groceries", amount: 1_000_000 }),
  txn({ categoryId: "transport", amount: 500_000 }),
  txn({ categoryId: "housing", amount: 4_000_000 }),
  txn({ categoryId: "entertainment", amount: 300_000 }),
];

describe("categoryToJarMap / duplicateCategoryIds", () => {
  it("maps each category to its jar (first-wins on overlap)", () => {
    const config = cfg([
      { id: "a", label: "A", categoryIds: ["dining", "groceries"] },
      { id: "b", label: "B", categoryIds: ["dining", "transport"] },
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
      { id: "food", label: "Ăn uống", categoryIds: ["dining", "groceries"] },
      { id: "home", label: "Nhà", categoryIds: ["housing"] },
      { id: "move", label: "Đi lại", categoryIds: ["transport"] },
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
      { id: "a", label: "A", categoryIds: ["dining"] },
      { id: "b", label: "B", categoryIds: ["dining"] },
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
    const chips = jarChipList(DEFAULT_JAR_CONFIG, BUILT_IN_EXPENSE_IDS);
    expect(chips.some((c) => c.jarId === "savings")).toBe(true); // 0-category jar still chipped
    expect(chips.some((c) => c.jarId === KHAC_JAR_ID)).toBe(false); // template covers all expenses
  });

  it("adds a trailing Khác chip when some expense category is unmapped", () => {
    const config = cfg([
      { id: "a", label: "A", categoryIds: ["dining"] },
    ]);
    const chips = jarChipList(config, BUILT_IN_EXPENSE_IDS);
    expect(chips[chips.length - 1].jarId).toBe(KHAC_JAR_ID);
  });
});
