// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Jar, JarConfig } from "@/domain/models";

/**
 * Write-door guards on every `/api/jars` route (plan 260919-1915 + 260923): the
 * balance-lens CASA cap on POST (opening deposit folded in) / PUT (S4) with the
 * "only an INCREASE of Σ spendable is rejected" rule (S5), reserved
 * sentinel ids (S9), strict `budgetLimit` (S15/A24/A25/A09), expense-only
 * categories (A11/A49), and DELETE removing the jar's rebalance legs (S8). Real
 * handlers + real stores over an in-memory SQLite. CIF_0001 CASA pinned to 18tr.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { POST, PUT } from "../route";
import { DELETE as deleteJar, PATCH as patchJar } from "../[id]/route";
import { POST as moveCategory } from "../[id]/categories/route";
import { writeJarConfig, readJarConfig } from "@/lib/jars-store";
import { casaPoolForCif } from "@/lib/casa-pool";
import { transferNow } from "@/lib/demo-clock";
import { jarBalances } from "@/domain/engine";
import { MAX_JAR_AMOUNT } from "@/domain/jar-rules";
import { ACCOUNTS_DDL, CORRECTIONS_DDL, JARS_DDL, TRANSACTIONS_DDL } from "./jar-route-test-ddl";

const CIF = "CIF_0001";
const BASE = "http://localhost/api/jars";

const seed = (jars: Jar[], cif = CIF) => writeJarConfig(cif, { version: 3, jars });
const limitOf = (id: string, cif = CIF) => readJarConfig(cif).jars.find((j) => j.id === id)?.budgetLimit;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const post = (jar: unknown, balance: unknown = 0, cif = CIF) => POST(req(BASE, "POST", { cif, jar, balance }));
const put = (jars: unknown) => PUT(req(BASE, "PUT", { cif: CIF, jars }));
const patchOne = (id: string, patch: unknown, cif = CIF) => patchJar(req(`${BASE}/${id}?cif=${cif}`, "PATCH", { patch }), ctx(id));

/** Set CIF_0001's live CASA (seeds its accounts first, then rewrites the current account). */
function setCasa(value: number): void {
  casaPoolForCif(CIF);
  holder.db!.prepare("UPDATE accounts SET available_balance = ? WHERE cif = ? AND type = 'current'").run(value, CIF);
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(JARS_DDL);
  holder.db.exec(ACCOUNTS_DDL);
  holder.db.exec(TRANSACTIONS_DDL);
  holder.db.exec(CORRECTIONS_DDL);
  // Pin the cap these cases are written against, independent of persona salary.
  setCasa(18_000_000);
});

describe("POST /api/jars — limit + opening balance (plan 260923 D2)", () => {
  const ledgerOf = (id: string) => (readJarConfig(CIF).ledger ?? []).filter((e) => e.jarId === id);

  it("a create's LIMIT alone never trips the cap (limit ≠ balance; the cap reads Σ max(0, balance))", async () => {
    // Σ limits 19tr > CASA 18tr, but the opening balance is 0 → nothing claimed.
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 14_000_000 }, 0);
    expect(res.status).toBe(201);
    expect(limitOf("b")).toBe(14_000_000);
  });

  it("balance 0 → 201 with exactly one opening row of 0 (a known 0, not null)", async () => {
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 1_000_000 }, 0);
    expect(res.status).toBe(201);
    const config: JarConfig = await res.json();
    const rows = (config.ledger ?? []).filter((e) => e.jarId === "b");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "deposit", amount: 0, isOpening: true, source: "self_reported" });
    const jar = config.jars.find((j) => j.id === "b")!;
    expect(jar.createdAt).toBe(rows[0].createdAt); // anchor and opening share one instant
    expect(jarBalances(config, [], transferNow().toISOString()).get("b")?.balance).toBe(0);
  });

  it("accepts a within-cap opening balance and writes jar + opening row together", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 13_000_000 }, 18_000_000);
    expect(res.status).toBe(201);
    expect(limitOf("b")).toBe(13_000_000);
    expect(ledgerOf("b").map((e) => e.amount)).toEqual([18_000_000]);
  });

  it("an opening balance above the CASA pool → 422 + overBy, nothing written (Red Team #3)", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 1_000_000 }, 19_000_000);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "over CASA cap", overBy: 1_000_000 });
    expect(readJarConfig(CIF).jars.map((j) => j.id)).not.toContain("b");
    expect(ledgerOf("b")).toEqual([]);
  });

  it("the cap counts existing balances too (Σ spendable, not just the new jar)", async () => {
    expect((await post({ id: "a", label: "A", categoryIds: [], budgetLimit: 0 }, 10_000_000)).status).toBe(201);
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 0 }, 9_000_000);
    expect(res.status).toBe(422);
    expect((await res.json()).overBy).toBe(1_000_000);
  });

  it.each<[string, unknown]>([
    ["missing", undefined],
    ["null", null],
    ["negative", -1],
    ["fractional", 1.5],
    ["string", "1000"],
    ["above-10^12", MAX_JAR_AMOUNT + 1],
  ])("rejects a %s balance with 422 (never defaulted to 0)", async (label, balance) => {
    const jar = { id: "b", label: "B", categoryIds: [], budgetLimit: 1_000 };
    // `post`'s default would fill a missing balance with 0 — send the raw body instead.
    const res = label === "missing" ? await POST(req(BASE, "POST", { cif: CIF, jar })) : await post(jar, balance);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/^balance is required/);
    expect(readJarConfig(CIF).jars.map((j) => j.id)).not.toContain("b");
  });

  it.each(["pool", "unclassified", "dieu-chinh-hu", "khac"])("rejects reserved id %s (S9)", async (id) => {
    const res = await post({ id, label: "X", categoryIds: [], budgetLimit: 0 });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe(`jar id ${id} is reserved`);
  });

  it.each([["1000"], [-1], [1000.5], [true], [{}], [MAX_JAR_AMOUNT + 1]])(
    "rejects budgetLimit %j (A09, Red Team #12)",
    async (budgetLimit) => {
      expect((await post({ id: "b", label: "B", categoryIds: [], budgetLimit })).status).toBe(422);
    },
  );

  // The limit is optional on create: absent/null = "chưa đặt" (stored null, never 0).
  it.each([[null], [undefined]])("a %j budgetLimit creates the jar with no limit", async (budgetLimit) => {
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit }, 0);
    expect(res.status).toBe(201);
    expect(limitOf("b")).toBeUndefined();
  });

  it("accepts limit and balance at exactly 10^12", async () => {
    setCasa(MAX_JAR_AMOUNT);
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: MAX_JAR_AMOUNT }, MAX_JAR_AMOUNT);
    expect(res.status).toBe(201);
  });

  it.each([["not-a-real-cat"], ["income"], ["transfer"], ["dieu-chinh-hu"]])(
    "rejects non-expense category %s (A11)",
    async (cat) => {
      expect((await post({ id: "b", label: "B", categoryIds: [cat], budgetLimit: 0 })).status).toBe(422);
    },
  );
});

describe("PUT /api/jars", () => {
  it("a replace raising Σ LIMITS over CASA passes — template jars carry no balance (A17 → D3)", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await put([
      { id: "x", label: "X", categoryIds: [], budgetLimit: 10_000_000 },
      { id: "y", label: "Y", categoryIds: [], budgetLimit: 10_000_000 },
    ]);
    expect(res.status).toBe(200);
    expect(limitOf("x")).toBe(10_000_000);
    expect(limitOf("a")).toBeUndefined();
    expect(readJarConfig(CIF).ledger).toEqual([]);
  });

  it("keeps the ledger of surviving ids and drops the ledger of replaced ones (D3)", async () => {
    expect((await post({ id: "a", label: "A", categoryIds: [], budgetLimit: 0 }, 1_000_000)).status).toBe(201);
    expect((await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 0 }, 2_000_000)).status).toBe(201);
    const res = await put([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 0 },
      { id: "z", label: "Z", categoryIds: [], budgetLimit: 3_000_000 },
    ]);
    expect(res.status).toBe(200);
    const ledger = ((await res.json()) as JarConfig).ledger ?? [];
    expect(ledger.map((e) => [e.jarId, e.amount])).toEqual([["a", 1_000_000]]); // z: no deposit, b: gone
  });

  it("re-saving an already-over-cap set passes (non-increasing)", async () => {
    const over = [
      { id: "x", label: "X", categoryIds: [], budgetLimit: 15_000_000 },
      { id: "y", label: "Y", categoryIds: [], budgetLimit: 10_000_000 },
    ];
    seed(over);
    expect((await put(over)).status).toBe(200);
  });

  it("rejects reserved ids but round-trips the system khac jar (S9)", async () => {
    expect((await put([{ id: "pool", label: "P", categoryIds: [] }])).status).toBe(422);
    expect((await put([{ id: "dieu-chinh-hu", label: "D", categoryIds: [] }])).status).toBe(422);
    const res = await put([{ id: "khac", label: "Khác", categoryIds: ["dining"] }]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as JarConfig).jars.map((j) => j.id)).toEqual(["khac"]);
  });

  it("rejects a fractional limit and a non-expense category", async () => {
    expect((await put([{ id: "x", label: "X", categoryIds: [], budgetLimit: 1.5 }])).status).toBe(422);
    expect((await put([{ id: "x", label: "X", categoryIds: ["income"] }])).status).toBe(422);
  });
});

describe("PATCH /api/jars/:id — strict limit + non-increasing cap (S15/S5)", () => {
  beforeEach(() =>
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 15_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 10_000_000 },
    ]),
  ); // Σ 25tr > CASA 18tr (legacy over-cap)

  it.each([["5000000"], [true], [{}], [1000.5]])("rejects budgetLimit %j with 422 (A24/A25)", async (v) => {
    expect((await patchOne("a", { budgetLimit: v })).status).toBe(422);
    expect(limitOf("a")).toBe(15_000_000);
  });

  it("lowering while still over cap passes (A34)", async () => {
    expect((await patchOne("a", { budgetLimit: 12_000_000 })).status).toBe(200);
    expect(limitOf("a")).toBe(12_000_000);
  });

  it("re-saving the same value passes after CASA dropped (C08)", async () => {
    setCasa(5_000_000);
    expect((await patchOne("a", { budgetLimit: 15_000_000 })).status).toBe(200);
  });

  it("raising a LIMIT while Σ limits is over CASA passes — the limit is a plan, not money (plan 260923)", async () => {
    const res = await patchOne("a", { budgetLimit: 15_000_001 });
    expect(res.status).toBe(200);
    expect(limitOf("a")).toBe(15_000_001);
  });

  it("with negative CASA a limit 0 → 1 raise still passes: no balance moves (C03, limit axis only)", async () => {
    seed([{ id: "k", label: "K", categoryIds: [], budgetLimit: 0 }]);
    setCasa(-1_000_000);
    expect((await patchOne("k", { budgetLimit: 0 })).status).toBe(200);
    expect((await patchOne("k", { budgetLimit: 1 })).status).toBe(200);
    expect(limitOf("k")).toBe(1);
  });

  it("rejects a non-expense categoryIds patch (A11)", async () => {
    expect((await patchOne("a", { categoryIds: ["transfer"] })).status).toBe(422);
  });
});

describe("POST /api/jars/:id/categories", () => {
  it.each([["not-a-real-cat-2"], ["income"], ["transfer"]])("rejects %s (A49)", async (categoryId) => {
    seed([{ id: "a", label: "A", categoryIds: [] }]);
    const res = await moveCategory(req(`${BASE}/a/categories?cif=${CIF}`, "POST", { categoryId }), ctx("a"));
    expect(res.status).toBe(422);
  });

  it("accepts an expense category", async () => {
    seed([{ id: "a", label: "A", categoryIds: [] }]);
    const res = await moveCategory(req(`${BASE}/a/categories?cif=${CIF}`, "POST", { categoryId: "dining" }), ctx("a"));
    expect(res.status).toBe(200);
  });
});

describe("jar writes validate against THIS persona's stored taxonomy", () => {
  /** Insert a custom category straight into the store (no route needed here). */
  function storeCategory(cif: string, id: string, archivedAt: string | null): void {
    readJarConfig(cif); // lazily seeds this cif's presets first
    holder.db!
      .prepare(
        `INSERT INTO categories (cif, id, label, kind, fixed, custom, archived_at, sort_order)
         VALUES (?, ?, ?, 'expense', 0, 1, ?, 99)`,
      )
      .run(cif, id, id, archivedAt);
  }

  it("rejects a category belonging to ANOTHER cif (422)", async () => {
    storeCategory("CIF_OTHER", "c_hoc-phi", null);
    seed([{ id: "a", label: "A", categoryIds: [] }]);
    const res = await patchOne("a", { categoryIds: ["c_hoc-phi"] });
    expect(res.status).toBe(422);
    expect((await res.json()).invalid).toEqual(["c_hoc-phi"]);
  });

  it("accepts an ARCHIVED id — archived leaves `assignable` but stays `known`", async () => {
    storeCategory(CIF, "c_hoc-phi", "2026-09-01T00:00:00.000Z");
    seed([{ id: "a", label: "A", categoryIds: [] }]);
    const res = await patchOne("a", { categoryIds: ["c_hoc-phi"] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as JarConfig).jars.find((j) => j.id === "a")?.categoryIds).toEqual(["c_hoc-phi"]);
  });
});

describe("DELETE /api/jars/:id — removes the jar's rebalance legs (S8)", () => {
  function insertTxn(id: string, rebalance?: Record<string, string>, cif = CIF, source = "self_reported"): void {
    const payload = { id, postedAt: "2026-09-16T10:00:00.000Z", amount: 500_000, categoryId: "dieu-chinh-hu", rebalance };
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, ?, ?, ?)")
      .run(cif, id, source, payload.postedAt, JSON.stringify(payload));
  }
  const ids = (cif = CIF) =>
    (holder.db!.prepare("SELECT id FROM transactions WHERE cif = ? ORDER BY id").all(cif) as { id: string }[]).map((r) => r.id);

  it("never deletes a bank row, even one whose payload looks like a leg of the jar (#5)", async () => {
    seed([{ id: "savings", label: "S", categoryIds: [] }]);
    const leg = { fromJarId: "savings", toJarId: "food", triggerTxnId: "t", origin: "manual" };
    insertTxn("bank-row", leg, CIF, "mock");
    insertTxn("self-leg", leg);
    const res = await deleteJar(req(`${BASE}/savings?cif=${CIF}`, "DELETE"), ctx("savings"));
    expect(res.headers.get("X-Rebalance-Legs-Deleted")).toBe("1");
    expect(ids()).toEqual(["bank-row"]);
  });

  it("deletes legs from/to the jar in the same write, keeps the rest", async () => {
    seed([
      { id: "savings", label: "S", categoryIds: [] },
      { id: "food", label: "F", categoryIds: ["dining"] },
    ]);
    const leg = (from: string, to: string) => ({ fromJarId: from, toJarId: to, triggerTxnId: "trig", origin: "manual" });
    insertTxn("trig");
    insertTxn("leg-from", leg("savings", "food"));
    insertTxn("leg-to", leg("pool", "savings"));
    insertTxn("leg-other", leg("pool", "food"));
    insertTxn("leg-other-cif", leg("savings", "food"), "CIF_OTHER");

    const res = await deleteJar(req(`${BASE}/savings?cif=${CIF}`, "DELETE"), ctx("savings"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Rebalance-Legs-Deleted")).toBe("2");
    expect(((await res.json()) as JarConfig).jars.map((j) => j.id)).not.toContain("savings");
    expect(ids()).toEqual(["leg-other", "trig"]);
    expect(ids("CIF_OTHER")).toEqual(["leg-other-cif"]);
  });

  it("removes the jar's ledger rows in the same write, keeps other jars' rows", async () => {
    expect((await post({ id: "a", label: "A", categoryIds: [], budgetLimit: 0 }, 1_000_000)).status).toBe(201);
    expect((await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 0 }, 2_000_000)).status).toBe(201);
    const res = await deleteJar(req(`${BASE}/a?cif=${CIF}`, "DELETE"), ctx("a"));
    expect(res.status).toBe(200);
    expect((((await res.json()) as JarConfig).ledger ?? []).map((e) => e.jarId)).toEqual(["b"]);
    const rows = holder.db!.prepare("SELECT jar_id FROM jar_ledger WHERE cif = ?").all(CIF) as { jar_id: string }[];
    expect(rows.map((r) => r.jar_id)).toEqual(["b"]);
  });

  it("reports 0 legs when none reference the jar", async () => {
    seed([{ id: "food", label: "F", categoryIds: ["dining"] }]);
    const res = await deleteJar(req(`${BASE}/food?cif=${CIF}`, "DELETE"), ctx("food"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Rebalance-Legs-Deleted")).toBe("0");
  });
});
