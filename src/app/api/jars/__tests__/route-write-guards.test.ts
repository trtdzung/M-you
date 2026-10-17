// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Jar, JarConfig } from "@/domain/models";

/**
 * Write-door guards on every `/api/jars` route (plan 260919-1915): CASA cap on
 * POST/PUT (S4) with the "only an INCREASE of Σ is rejected" rule (S5), reserved
 * sentinel ids (S9), strict `budgetLimit` (S15/A24/A25/A09), expense-only
 * categories (A11/A49), and DELETE removing the jar's rebalance legs (S8). Real
 * handlers + real stores over an in-memory SQLite. CIF_0001 CASA = 18tr.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { PATCH as batchPatchRoute, POST, PUT } from "../route";
import { DELETE as deleteJar, PATCH as patchJar } from "../[id]/route";
import { POST as moveCategory } from "../[id]/categories/route";
import { writeJarConfig, readJarConfig } from "@/lib/jars-store";
import { casaPoolForCif } from "@/lib/casa-pool";
import { ACCOUNTS_DDL, JARS_DDL, TRANSACTIONS_DDL } from "./jar-route-test-ddl";

const CIF = "CIF_0001";
const BASE = "http://localhost/api/jars";

const seed = (jars: Jar[], cif = CIF) => writeJarConfig(cif, { version: 3, jars });
const limitOf = (id: string, cif = CIF) => readJarConfig(cif).jars.find((j) => j.id === id)?.budgetLimit;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const post = (jar: unknown, cif = CIF) => POST(req(BASE, "POST", { cif, jar }));
const put = (jars: unknown) => PUT(req(BASE, "PUT", { cif: CIF, jars }));
const batch = (patches: unknown, cif = CIF) => batchPatchRoute(req(`${BASE}?cif=${cif}`, "PATCH", { patches }));
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
});

describe("POST /api/jars", () => {
  it("rejects a create that pushes Σ over CASA (A10) and leaves the store unchanged", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 14_000_000 });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "over CASA cap", overBy: 1_000_000 });
    expect(limitOf("b")).toBeUndefined();
  });

  it("accepts a within-cap create", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    expect((await post({ id: "b", label: "B", categoryIds: [], budgetLimit: 13_000_000 })).status).toBe(201);
    expect(limitOf("b")).toBe(13_000_000);
  });

  it.each(["pool", "unclassified", "dieu-chinh-hu", "khac"])("rejects reserved id %s (S9)", async (id) => {
    const res = await post({ id, label: "X", categoryIds: [] });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe(`jar id ${id} is reserved`);
  });

  it.each([["1000"], [-1], [1000.5], [true], [{}]])("rejects budgetLimit %j (A09)", async (budgetLimit) => {
    expect((await post({ id: "b", label: "B", categoryIds: [], budgetLimit })).status).toBe(422);
  });

  it("treats budgetLimit null as unset (never 0)", async () => {
    expect((await post({ id: "b", label: "B", categoryIds: [], budgetLimit: null })).status).toBe(201);
    expect(limitOf("b")).toBeUndefined();
  });

  it.each([["not-a-real-cat"], ["income"], ["transfer"], ["dieu-chinh-hu"]])(
    "rejects non-expense category %s (A11)",
    async (cat) => {
      expect((await post({ id: "b", label: "B", categoryIds: [cat] })).status).toBe(422);
    },
  );
});

describe("PUT /api/jars", () => {
  it("rejects a replace that raises Σ over CASA (A17)", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await put([
      { id: "x", label: "X", categoryIds: ["housing"], budgetLimit: 10_000_000 },
      { id: "y", label: "Y", categoryIds: ["dining"], budgetLimit: 10_000_000 },
    ]);
    expect(res.status).toBe(422);
    expect((await res.json()).overBy).toBe(2_000_000);
    expect(limitOf("a")).toBe(5_000_000);
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

  it("raising while over cap is rejected with the full overBy", async () => {
    const res = await patchOne("a", { budgetLimit: 15_000_001 });
    expect(res.status).toBe(422);
    expect((await res.json()).overBy).toBe(7_000_001);
  });

  it("limit 0 passes with negative CASA; raising to 1 does not (C03)", async () => {
    seed([{ id: "k", label: "K", categoryIds: [], budgetLimit: 0 }]);
    setCasa(-1_000_000);
    expect((await patchOne("k", { budgetLimit: 0 })).status).toBe(200);
    const res = await patchOne("k", { budgetLimit: 1 });
    expect(res.status).toBe(422);
    expect((await res.json()).overBy).toBe(1_000_001);
  });

  it("rejects a non-expense categoryIds patch (A11)", async () => {
    expect((await patchOne("a", { categoryIds: ["transfer"] })).status).toBe(422);
  });
});

describe("PATCH /api/jars (batch) — non-increasing writes always pass", () => {
  beforeEach(() =>
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 15_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 10_000_000 },
    ]),
  );

  it("an empty batch on an over-cap config is a 200 no-op (A36)", async () => {
    expect((await batch({})).status).toBe(200);
  });

  it("a lowering batch passes even if still over", async () => {
    expect((await batch({ a: { budgetLimit: 14_000_000 } })).status).toBe(200);
  });

  it("a string budgetLimit rejects the batch (S15)", async () => {
    expect((await batch({ a: { budgetLimit: "1" } })).status).toBe(422);
  });

  it("unknown CASA blocks increases only (overBy null)", async () => {
    const cif = "CIF_NOACC";
    seed([{ id: "o", label: "O", categoryIds: [], budgetLimit: 1_000 }], cif);
    expect((await batch({ o: { budgetLimit: 500 } }, cif)).status).toBe(200);
    const res = await batch({ o: { budgetLimit: 2_000 } }, cif);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "over CASA cap", overBy: null });
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

  it("reports 0 legs when none reference the jar", async () => {
    seed([{ id: "food", label: "F", categoryIds: ["dining"] }]);
    const res = await deleteJar(req(`${BASE}/food?cif=${CIF}`, "DELETE"), ctx("food"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Rebalance-Legs-Deleted")).toBe("0");
  });
});
