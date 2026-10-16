import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_BY_ID } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";

describe("DEFAULT_JAR_CONFIG seed", () => {
  it("is a version-1, auto-income template", () => {
    expect(DEFAULT_JAR_CONFIG.version).toBe(1);
    expect(DEFAULT_JAR_CONFIG.incomeBasis).toBe("auto");
  });

  it("percent allocations sum to 100", () => {
    const sum = DEFAULT_JAR_CONFIG.jars.reduce(
      (s, j) => s + (j.allocation.mode === "percent" ? j.allocation.value : 0),
      0,
    );
    expect(sum).toBe(100);
  });

  it("is spend-only — every mapped category is an expense category (AD1)", () => {
    for (const jar of DEFAULT_JAR_CONFIG.jars) {
      for (const id of jar.categoryIds) {
        expect(CATEGORY_BY_ID[id]?.kind).toBe("expense");
      }
    }
  });

  it("covers all expense categories exactly once (no duplicates, no gaps — AD6)", () => {
    const mapped = DEFAULT_JAR_CONFIG.jars.flatMap((j) => j.categoryIds);
    const expenseIds = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.id);
    expect(new Set(mapped).size).toBe(mapped.length); // a category is in ≤ 1 jar
    expect([...mapped].sort()).toEqual([...expenseIds].sort()); // and every one is covered
  });
});
