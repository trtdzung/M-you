// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATEGORIES } from "@/domain/models";

/**
 * The per-cif category store (plan 260920-1019 Phase 02) against an in-memory DB
 * built from the real `data/schema.sql` — lazy seeding, tenant isolation, the
 * assignable-vs-known split, usage counting and the one-transaction delete.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import {
  assignableCategoryIds,
  categoryUsageCount,
  knownCategoryIds,
  knownExpenseCategoryIds,
  readCategories,
  readCategory,
} from "../categories-store";
import { deleteCategory, insertCategory, patchCategory } from "../categories-write";
import { readJarConfig, writeJarConfig } from "../jars-store";

const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");
const A = "CIF_A";
const B = "CIF_B";

const rowCount = (cif: string) =>
  (holder.db!.prepare("SELECT COUNT(*) AS n FROM categories WHERE cif = ?").get(cif) as { n: number }).n;

/** Create a custom category for `cif` and return its generated id. */
function create(cif: string, label: string, jarId?: string): string {
  const res = insertCategory(cif, { label, fixed: false, ...(jarId ? { jarId } : {}) });
  if (!res.ok) throw new Error(`insert failed: ${res.failure.code}`);
  const created = res.categories.find((c) => c.label === label);
  if (!created) throw new Error("created category missing from the returned taxonomy");
  return created.id;
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("lazy per-cif seed", () => {
  it("produces the presets with custom = 0 on first read, and does not duplicate", () => {
    expect(rowCount(A)).toBe(0);
    expect(readCategories(A).map((c) => c.id)).toEqual(CATEGORIES.map((c) => c.id));
    expect(rowCount(A)).toBe(CATEGORIES.length);
    readCategories(A);
    expect(rowCount(A)).toBe(CATEGORIES.length);
    for (const preset of CATEGORIES) expect(readCategory(A, preset.id)?.custom).toBe(false);
  });

  it("never clobbers a renamed preset row on a later read", () => {
    readCategories(A);
    holder.db!.prepare("UPDATE categories SET label = ? WHERE cif = ? AND id = ?").run("Đổi", A, "dining");
    expect(readCategories(A).find((c) => c.id === "dining")?.label).toBe("Đổi");
  });
});

describe("cross-cif isolation", () => {
  it("keeps a custom category out of the other persona's reads and writes", () => {
    const id = create(A, "Học phí");
    expect(readCategories(A).map((c) => c.id)).toContain(id);
    expect(readCategories(B).map((c) => c.id)).not.toContain(id);
    expect(knownCategoryIds(B).has(id)).toBe(false);
    expect(knownExpenseCategoryIds(B).has(id)).toBe(false);

    // Persona B may reuse the same label — the duplicate check is per-cif.
    expect(create(B, "Học phí")).toBe(id);
    expect(rowCount(A)).toBe(CATEGORIES.length + 1);

    // …and may not patch or delete persona A's row.
    expect(patchCategory(B, id, { label: "Đổi" })).toMatchObject({ ok: true });
    expect(readCategories(A).find((c) => c.id === id)?.label).toBe("Học phí");
    expect(deleteCategory(B, id)).toMatchObject({ ok: true });
    expect(readCategories(A).map((c) => c.id)).toContain(id);
  });
});

describe("assignable vs known", () => {
  it("assignable excludes archived and transfer; known keeps both", () => {
    const id = create(A, "Học phí");
    expect(assignableCategoryIds(A).has(id)).toBe(true);
    expect(assignableCategoryIds(A).has("transfer")).toBe(false);
    expect(knownCategoryIds(A).has("transfer")).toBe(true);

    expect(patchCategory(A, id, { archived: true })).toMatchObject({ ok: true });
    expect(assignableCategoryIds(A).has(id)).toBe(false);
    expect(knownExpenseCategoryIds(A).has(id)).toBe(true);
    expect(knownCategoryIds(A).has(id)).toBe(true);
    expect(readCategories(A).map((c) => c.id)).not.toContain(id);
    expect(readCategories(A, { includeArchived: true }).find((c) => c.id === id)?.archived).toBe(true);
  });
});

describe("categoryUsageCount", () => {
  function insertTxn(cif: string, id: string, categoryId: string): void {
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
      .run(cif, id, "2026-09-01T00:00:00.000Z", JSON.stringify({ id, categoryId }));
  }
  function insertCorrection(cif: string, txnId: string, categoryId: string): void {
    holder.db!
      .prepare("INSERT INTO transaction_corrections (cif, txn_id, payload, updated_at) VALUES (?, ?, ?, ?)")
      .run(cif, txnId, JSON.stringify({ categoryId, origin: "user" }), "now");
  }

  it("counts transactions AND corrections, for that cif only", () => {
    const id = create(A, "Học phí");
    expect(categoryUsageCount(A, id)).toBe(0);

    insertTxn(A, "t1", id);
    insertTxn(A, "t2", id);
    insertTxn(A, "t3", "dining");
    insertTxn(B, "t4", id); // other persona — must not count
    insertCorrection(A, "t9", id);
    insertCorrection(B, "t9", id); // other persona — must not count

    expect(categoryUsageCount(A, id)).toBe(3);
    expect(categoryUsageCount(B, id)).toBe(2);
  });
});

describe("deleteCategory", () => {
  it("strips the id from every jar of that cif in the same transaction", () => {
    const id = create(A, "Học phí");
    writeJarConfig(A, {
      version: 3,
      jars: [
        { id: "study", label: "Học", categoryIds: [id] },
        { id: "food", label: "Ăn", categoryIds: ["dining"] },
      ],
    });
    expect(readJarConfig(A).jars.find((j) => j.id === "study")?.categoryIds).toEqual([id]);

    const res = deleteCategory(A, id);
    expect(res).toMatchObject({ ok: true });
    expect(readCategories(A).map((c) => c.id)).not.toContain(id);
    expect(readJarConfig(A).jars.flatMap((j) => j.categoryIds)).not.toContain(id);
    expect(rowCount(A)).toBe(CATEGORIES.length);
  });

  it("refuses an in-use category and leaves both tables untouched", () => {
    const id = create(A, "Học phí");
    writeJarConfig(A, { version: 3, jars: [{ id: "study", label: "Học", categoryIds: [id] }] });
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
      .run(A, "t1", "2026-09-01T00:00:00.000Z", JSON.stringify({ id: "t1", categoryId: id }));

    expect(deleteCategory(A, id)).toEqual({ ok: false, failure: { code: "in-use", usedBy: 1 } });
    expect(readCategories(A).map((c) => c.id)).toContain(id);
    expect(readJarConfig(A).jars.find((j) => j.id === "study")?.categoryIds).toContain(id);
  });

  it("rolls BOTH tables back when the jar write throws mid-way", () => {
    const id = create(A, "Học phí");
    writeJarConfig(A, { version: 3, jars: [{ id: "study", label: "Học", categoryIds: [id] }] });
    const realPrepare = holder.db!.prepare.bind(holder.db!);
    const spy = vi.spyOn(holder.db!, "prepare").mockImplementation(((sql: string) => {
      if (sql.startsWith("INSERT INTO jars")) throw new Error("disk full");
      return realPrepare(sql);
    }) as typeof realPrepare);

    expect(() => deleteCategory(A, id)).toThrow("disk full");
    spy.mockRestore();
    expect(readCategories(A).map((c) => c.id)).toContain(id);
    expect(readJarConfig(A).jars.find((j) => j.id === "study")?.categoryIds).toEqual([id]);
  });

  it("403s a bundled preset and 404s an unknown id", () => {
    expect(deleteCategory(A, "dining")).toEqual({ ok: false, failure: { code: "built-in" } });
    expect(deleteCategory(A, "c_nope")).toEqual({ ok: false, failure: { code: "not-found" } });
  });
});
