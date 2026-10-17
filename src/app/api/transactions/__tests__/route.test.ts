// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Transaction } from "@/domain/models";
import { PERSONAS } from "@/providers/mock/personas";
import { generateDataset } from "@/providers/mock/fixtures/generate";

/**
 * Route-level integration for `GET /api/transactions` — the SQLite-backed bank
 * transaction history. Runs the REAL store against an in-memory DB built from the
 * real `data/schema.sql`, so lazy seeding, period bounds and ordering are
 * load-bearing. `@/lib/db` is mocked to that DB; `server-only` is neutralised.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET } from "../route";

const CIF = PERSONAS.stable.cif;
const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");

function get(query: string): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/transactions${query}`));
}
function rowCount(cif = CIF): number {
  return (holder.db!.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ?").get(cif) as { n: number }).n;
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("GET /api/transactions", () => {
  it("422 without a cif", async () => {
    expect((await get("")).status).toBe(422);
  });

  it("seeds the persona's generated history on first read and persists it", async () => {
    const expected = generateDataset(PERSONAS.stable).transactions;
    expect(rowCount()).toBe(0);

    const txns = (await (await get(`?cif=${CIF}`)).json()) as Transaction[];

    expect(txns).toHaveLength(expected.length);
    expect(new Set(txns.map((t) => t.id))).toEqual(new Set(expected.map((t) => t.id)));
    expect(txns.every((t) => t.source === "mock")).toBe(true);
    expect(rowCount()).toBe(expected.length);
  });

  it("still seeds when only self_reported rows exist, and never returns them (one table, #5)", async () => {
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, 'manual-1', 'self_reported', ?, '{}')")
      .run(CIF, "2026-09-15T00:00:00.000Z");
    const expected = generateDataset(PERSONAS.stable).transactions;
    const txns = (await (await get(`?cif=${CIF}`)).json()) as Transaction[];
    expect(txns).toHaveLength(expected.length);
    expect(txns.some((t) => t.id === "manual-1")).toBe(false);
  });

  it("does not re-seed or duplicate on later reads", async () => {
    await get(`?cif=${CIF}`);
    const first = rowCount();
    await get(`?cif=${CIF}`);
    expect(rowCount()).toBe(first);
  });

  it("serves the stored rows, not the generator (DB is the source of truth)", async () => {
    await get(`?cif=${CIF}`);
    holder.db!.prepare("DELETE FROM transactions WHERE cif = ? AND id <> (SELECT MIN(id) FROM transactions WHERE cif = ?)").run(CIF, CIF);
    const txns = (await (await get(`?cif=${CIF}`)).json()) as Transaction[];
    expect(txns).toHaveLength(1);
  });

  it("returns newest first", async () => {
    const txns = (await (await get(`?cif=${CIF}`)).json()) as Transaction[];
    for (let i = 1; i < txns.length; i++) expect(txns[i - 1].postedAt >= txns[i].postedAt).toBe(true);
  });

  it("applies inclusive from/to bounds", async () => {
    const from = "2026-06-01T00:00:00.000Z";
    const to = "2026-06-30T23:59:59.999Z";
    const txns = (await (await get(`?cif=${CIF}&from=${from}&to=${to}`)).json()) as Transaction[];
    const expected = generateDataset(PERSONAS.stable).transactions.filter((t) => t.postedAt >= from && t.postedAt <= to);
    expect(txns.length).toBeGreaterThan(0);
    expect(txns).toHaveLength(expected.length);
  });

  it("an unknown cif gets [] and seeds nothing", async () => {
    const txns = (await (await get("?cif=CIF_NOPE")).json()) as Transaction[];
    expect(txns).toEqual([]);
    expect(rowCount("CIF_NOPE")).toBe(0);
  });

  it("drops a corrupt payload instead of failing the whole read", async () => {
    await get(`?cif=${CIF}`);
    const before = rowCount();
    holder.db!.prepare("INSERT INTO transactions (cif, id, posted_at, payload) VALUES (?, 'bad', '2026-09-01', '{oops')").run(CIF);
    const txns = (await (await get(`?cif=${CIF}`)).json()) as Transaction[];
    expect(txns).toHaveLength(before);
  });
});
