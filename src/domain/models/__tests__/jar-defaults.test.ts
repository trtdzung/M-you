import { describe, expect, it } from "vitest";
import { CATEGORY_BY_ID } from "@/domain/models";
import type { Jar } from "@/domain/models";
import {
  budgetsFromJars,
  configFromTemplate,
  DEFAULT_JAR_CONFIG,
  JAR_TEMPLATES,
  JAR_TEMPLATE_LIST,
} from "@/domain/models/jar-defaults";

describe("jar templates (BIDV wallet model / v3)", () => {
  it("ships exactly three templates: Cá nhân (6), Gia đình (4), Kinh doanh (3)", () => {
    expect(JAR_TEMPLATE_LIST.map((t) => t.id)).toEqual(["caNhan", "giaDinh", "kinhDoanh"]);
    expect(JAR_TEMPLATES.caNhan.jars).toHaveLength(6);
    expect(JAR_TEMPLATES.giaDinh.jars).toHaveLength(4);
    expect(JAR_TEMPLATES.kinhDoanh.jars).toHaveLength(3);
  });

  it("the caNhan savings jar has no categories and NO budgetLimit (chưa đặt, never 0)", () => {
    const savings = JAR_TEMPLATES.caNhan.jars.find((j) => j.id === "savings");
    expect(savings).toBeDefined();
    expect(savings?.categoryIds).toEqual([]);
    expect(savings?.budgetLimit).toBeUndefined();
  });

  it("no category appears in two jars within a template (one-category-one-jar)", () => {
    for (const t of JAR_TEMPLATE_LIST) {
      const mapped = t.jars.flatMap((j) => j.categoryIds);
      expect(new Set(mapped).size).toBe(mapped.length);
    }
  });

  it("maps only real expense categories", () => {
    for (const t of JAR_TEMPLATE_LIST) {
      for (const jar of t.jars) {
        for (const id of jar.categoryIds) {
          expect(CATEGORY_BY_ID[id]?.kind).toBe("expense");
        }
      }
    }
  });

  it("DEFAULT_JAR_CONFIG is v3 Cá nhân, with no legacy allocation field", () => {
    expect(DEFAULT_JAR_CONFIG.version).toBe(3);
    expect(DEFAULT_JAR_CONFIG).toEqual(configFromTemplate(JAR_TEMPLATES.caNhan));
    expect("incomeBasis" in DEFAULT_JAR_CONFIG).toBe(false);
    expect(DEFAULT_JAR_CONFIG.jars.every((j) => !("allocation" in j))).toBe(true);
  });

  it("configFromTemplate returns a version 3 config", () => {
    expect(configFromTemplate(JAR_TEMPLATES.giaDinh).version).toBe(3);
    expect(configFromTemplate(JAR_TEMPLATES.kinhDoanh).version).toBe(3);
  });
});

describe("budgetsFromJars (hũ IS the budget)", () => {
  it("splits a jar limit evenly across its categories from the Cá nhân template", () => {
    const budgets = budgetsFromJars(DEFAULT_JAR_CONFIG.jars);
    const byCat = Object.fromEntries(budgets.map((b) => [b.categoryId, b.limit]));
    // Thiết yếu 8tr / 4 = 2tr each; Ăn uống 4tr / 2 = 2tr each; Di chuyển 1.5tr;
    // Hưởng thụ 2.5tr / 2 = 1.25tr each; Sức khỏe 1tr.
    expect(byCat).toEqual({
      housing: 2_000_000,
      utilities: 2_000_000,
      insurance: 2_000_000,
      subscriptions: 2_000_000,
      dining: 2_000_000,
      groceries: 2_000_000,
      transport: 1_500_000,
      entertainment: 1_250_000,
      shopping: 1_250_000,
      health: 1_000_000,
    });
    expect(budgets.every((b) => b.period === "monthly")).toBe(true);
  });

  it("skips jars with no limit or no categories (never a silent 0 — invariant #6)", () => {
    // "Tiết kiệm" has categories:[] and no budgetLimit → contributes nothing.
    const savingsCats = new Set(
      DEFAULT_JAR_CONFIG.jars.find((j) => j.id === "savings")?.categoryIds ?? [],
    );
    const budgets = budgetsFromJars(DEFAULT_JAR_CONFIG.jars);
    expect(budgets.some((b) => savingsCats.has(b.categoryId))).toBe(false);
    expect(budgets.some((b) => b.limit === 0)).toBe(false);
  });

  it("per-category budgets always sum EXACTLY back to each jar limit (no rounding drift)", () => {
    // A deliberately non-divisible limit: 1,000,000 / 3 = 333,333 r1.
    const jars: Jar[] = [{ id: "x", label: "X", categoryIds: ["a", "b", "c"], budgetLimit: 1_000_000 }];
    const budgets = budgetsFromJars(jars);
    expect(budgets.map((b) => b.limit)).toEqual([333_334, 333_333, 333_333]);
    expect(budgets.reduce((sum, b) => sum + b.limit, 0)).toBe(1_000_000);
  });
});

describe("budgetsFromJars — whole-VND + corrupt-limit guards (B13/N11b)", () => {
  it("B13: a fractional limit splits into INTEGER VND (rounded limit, floor splits, remainder first)", () => {
    const jars: Jar[] = [{ id: "x", label: "X", categoryIds: ["a", "b", "c"], budgetLimit: 10.5 }];
    const limits = budgetsFromJars(jars).map((b) => b.limit);
    expect(limits).toEqual([5, 3, 3]); // round(10.5) = 11 → 3 r2
    expect(limits.every(Number.isInteger)).toBe(true);
    expect(limits.reduce((s, n) => s + n, 0)).toBe(11);
  });

  it.each([NaN, Infinity, -1])("N11b: budgetLimit=%s is treated as unset — contributes nothing", (budgetLimit) => {
    const jars: Jar[] = [{ id: "x", label: "X", categoryIds: ["a", "b"], budgetLimit }];
    expect(budgetsFromJars(jars)).toEqual([]);
  });
});
