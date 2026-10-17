import { describe, expect, it } from "vitest";
import type { JarConfig, StoredCategory } from "@/domain/models";
import { categoryLabel } from "@/domain/models";
import { BUILT_IN_EXPENSE_IDS } from "@/domain/models/jar-defaults";
import { healOrphanCategories } from "@/domain/jar-rules";
import {
  categoryToJarMap,
  groupSpendingByJar,
  orphanExpenseCategoryIds,
  KHAC_JAR_ID,
} from "../category-jars";
import { spendingByCategory } from "../category";
import { aggregateCashflow } from "../cashflow";
import { monthPeriod } from "../types";
import { txn } from "./helpers";

/**
 * Tests #6–#11 — the engine against a taxonomy that is DATA, not the bundled
 * constant. Every parameterised entry point is exercised with a set that both
 * ADDS a category the user created and ARCHIVES another, because those are the
 * two directions the constant got wrong: a custom category was invisible, and an
 * archived one was still offered.
 *
 * The money assertions here are the point. Σ-conservation (#7) and "an archived
 * id keeps its spend in its jar" (#9) are what stop the taxonomy from quietly
 * moving a total.
 */
const JUNE = monthPeriod(2026, 5);

const cfg = (jars: JarConfig["jars"]): JarConfig => ({ version: 3, jars });

/**
 * One persona's stored taxonomy: the presets, plus a custom category they created
 * ("Học phí") and one they later hid ("Quà tết"). Only a CUSTOM row can be
 * archived — `categories-write.ts` refuses to touch a built-in — which is why the
 * archived fixture id is a `c_` one.
 */
const HOC_PHI: StoredCategory = { id: "c_hoc-phi", label: "Học phí", kind: "expense", fixed: true };
const QUA_TET: StoredCategory = { id: "c_qua-tet", label: "Quà tết", kind: "expense", fixed: false, archived: true };

const STORED: StoredCategory[] = [
  ...BUILT_IN_EXPENSE_IDS.map(
    (id): StoredCategory => ({ id, label: id, kind: "expense", fixed: id === "housing" }),
  ),
  HOC_PHI,
  QUA_TET,
];

/** What a picker may offer: active expense only (what `useCategories().assignable` is). */
const ASSIGNABLE = STORED.filter((c) => !c.archived).map((c) => c.id);
const LABELS: ReadonlyMap<string, string> = new Map(STORED.map((c) => [c.id, c.label]));
const FIXED: ReadonlySet<string> = new Set(STORED.filter((c) => c.fixed).map((c) => c.id));

/** Spend across a preset, the active custom category, and the ARCHIVED one. */
const spend = [
  txn({ categoryId: "dining", amount: 2_000_000 }),
  txn({ categoryId: "housing", amount: 4_000_000 }),
  txn({ categoryId: "c_hoc-phi", amount: 3_000_000 }),
  txn({ categoryId: "c_qua-tet", amount: 500_000 }),
];

describe("#6 a custom category with no jar is an orphan, and heals into Khác exactly once", () => {
  it("orphanExpenseCategoryIds reports it once the persona's set includes it", () => {
    const config = cfg([{ id: "food", label: "Ăn uống", categoryIds: ["dining"] }]);
    const orphans = orphanExpenseCategoryIds(config, ASSIGNABLE);
    expect(orphans).toContain("c_hoc-phi");
    expect(orphans).not.toContain("dining");
    // The archived category is NOT in the assignable set, so it is not an orphan to
    // be re-homed — it keeps whatever jar already holds it.
    expect(orphans).not.toContain("c_qua-tet");
  });

  it("healOrphanCategories puts it in Khác once, and is idempotent", () => {
    const config = cfg([{ id: "food", label: "Ăn uống", categoryIds: ["dining"] }]);
    const healed = healOrphanCategories(config, ASSIGNABLE);
    const khac = healed.jars.find((j) => j.id === KHAC_JAR_ID);
    expect(khac?.categoryIds.filter((id) => id === "c_hoc-phi")).toEqual(["c_hoc-phi"]);
    // Running it again adds nothing (no duplicate, no second Khác jar).
    const twice = healOrphanCategories(healed, ASSIGNABLE);
    expect(twice.jars.filter((j) => j.id === KHAC_JAR_ID)).toHaveLength(1);
    expect(twice.jars.find((j) => j.id === KHAC_JAR_ID)?.categoryIds).toEqual(khac?.categoryIds);
    // Every assignable id is claimed by exactly one jar afterwards.
    const claimed = twice.jars.flatMap((j) => j.categoryIds);
    for (const id of ASSIGNABLE) expect(claimed.filter((c) => c === id)).toHaveLength(1);
  });
});

describe("#7 Σ conservation with a dynamic taxonomy", () => {
  it("Σ group.amount === Σ spendingByCategory.amount, custom category included", () => {
    const config = cfg([
      { id: "food", label: "Ăn uống", categoryIds: ["dining"] },
      { id: "home", label: "Nhà ở", categoryIds: ["housing"] },
      { id: "edu", label: "Học hành", categoryIds: ["c_hoc-phi"] },
      { id: "gift", label: "Quà cáp", categoryIds: ["c_qua-tet"] },
    ]);
    const groups = groupSpendingByJar(config, spend, JUNE, LABELS);
    const groupTotal = groups.reduce((s, g) => s + g.amount, 0);
    const catTotal = spendingByCategory(spend, JUNE, undefined, LABELS).reduce((s, c) => s + c.amount, 0);
    expect(groupTotal).toBe(catTotal);
    expect(catTotal).toBe(9_500_000); // every row above, none dropped
    expect(groups.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 6);
  });

  it("an UNCLAIMED custom category lands in Khác instead of vanishing", () => {
    const config = cfg([{ id: "food", label: "Ăn uống", categoryIds: ["dining"] }]);
    const groups = groupSpendingByJar(config, spend, JUNE, LABELS);
    expect(groups.find((g) => g.jarId === KHAC_JAR_ID)?.amount).toBe(7_500_000);
    expect(groups.reduce((s, g) => s + g.amount, 0)).toBe(9_500_000);
  });
});

describe("#8 a category listed by two jars is still counted once", () => {
  it("first-wins holds for a custom id too", () => {
    const config = cfg([
      { id: "a", label: "A", categoryIds: ["c_hoc-phi"] },
      { id: "b", label: "B", categoryIds: ["c_hoc-phi", "dining"] },
    ]);
    expect(categoryToJarMap(config).get("c_hoc-phi")).toBe("a");
    const groups = groupSpendingByJar(config, spend, JUNE, LABELS);
    expect(groups.find((g) => g.jarId === "a")?.amount).toBe(3_000_000);
    expect(groups.find((g) => g.jarId === "b")?.amount).toBe(2_000_000); // dining only
    expect(groups.reduce((s, g) => s + g.amount, 0)).toBe(9_500_000);
  });
});

describe("#9 an archived id still held by a jar keeps its spend there", () => {
  it("historical totals do not move when a category is archived", () => {
    const config = cfg([
      { id: "gift", label: "Quà cáp", categoryIds: ["c_qua-tet"] },
      { id: "food", label: "Ăn uống", categoryIds: ["dining"] },
    ]);
    const groups = groupSpendingByJar(config, spend, JUNE, LABELS);
    // `c_qua-tet` is archived — invisible in every picker, unchanged in every total.
    expect(groups.find((g) => g.jarId === "gift")?.amount).toBe(500_000);
    expect(groups.find((g) => g.jarId === KHAC_JAR_ID)?.amount).toBe(7_000_000);

    // And healing must not strip it: heal only ever ADDS, so the jar keeps it.
    const healed = healOrphanCategories(config, ASSIGNABLE);
    expect(healed.jars.find((j) => j.id === "gift")?.categoryIds).toContain("c_qua-tet");
    expect(groupSpendingByJar(healed, spend, JUNE, LABELS).find((g) => g.jarId === "gift")?.amount).toBe(500_000);
  });
});

describe("#10 cashflow fixed vs discretionary follows the passed set", () => {
  it("a custom category flagged fixed counts as fixed", () => {
    const flow = aggregateCashflow(spend, JUNE, FIXED);
    // housing (4tr) + c_hoc-phi (3tr) are `fixed` in THIS persona's taxonomy.
    expect(flow.fixed).toBe(7_000_000);
    expect(flow.discretionary).toBe(2_500_000);
    expect(flow.fixed + flow.discretionary).toBe(flow.expense);
  });

  it("fixed + discretionary === expense with an EMPTY fixed set too", () => {
    const flow = aggregateCashflow(spend, JUNE, new Set());
    expect(flow.fixed).toBe(0);
    expect(flow.discretionary).toBe(flow.expense);
    expect(flow.fixed + flow.discretionary).toBe(flow.expense);
    // Same money either way — the split is presentation, never a total.
    expect(flow.expense).toBe(aggregateCashflow(spend, JUNE, FIXED).expense);
  });
});

describe("#11 categoryLabel with and without the labels map", () => {
  it("resolves a custom label from the map", () => {
    expect(categoryLabel("c_hoc-phi", LABELS)).toBe("Học phí");
  });

  it("returns the raw id (never throws) for an unknown id with no map", () => {
    expect(categoryLabel("c_hoc-phi")).toBe("c_hoc-phi");
    expect(categoryLabel("c_ghost", LABELS)).toBe("c_ghost");
    expect(() => categoryLabel("")).not.toThrow();
  });

  it("still names an ARCHIVED category (a past transaction keeps its label)", () => {
    expect(categoryLabel("c_qua-tet", LABELS)).toBe("Quà tết");
    expect(LABELS.has("c_qua-tet")).toBe(true);
  });
});
