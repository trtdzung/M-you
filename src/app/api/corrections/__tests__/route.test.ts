// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Route-level integration for `/api/corrections` — the SQLite-backed
 * per-transaction label overlay. Runs the REAL store (normalize, taxonomy check,
 * user-wins guard) against an in-memory DB built from `data/schema.sql`.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET, PATCH } from "../route";
import { MAX_CHANGES } from "@/lib/corrections-store";

const CIF = "CIF_0001";
const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");

function get(query: string): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/corrections${query}`));
}
function patch(body: unknown): Promise<Response> {
  return PATCH(
    new NextRequest("http://localhost/api/corrections", {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}
function rowCount(): number {
  return (holder.db!.prepare("SELECT COUNT(*) AS n FROM transaction_corrections").get() as { n: number }).n;
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("GET /api/corrections", () => {
  it("returns an empty overlay for a persona with no labels", async () => {
    const res = await get(`?cif=${CIF}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("422 without cif", async () => {
    expect((await get("")).status).toBe(422);
  });

  it("skips a corrupt payload instead of fabricating a label", async () => {
    holder.db!.prepare("INSERT INTO transaction_corrections VALUES (?, ?, ?, ?)").run(CIF, "t1", "{bad", "now");
    expect(await (await get(`?cif=${CIF}`)).json()).toEqual({});
  });
});

describe("PATCH /api/corrections", () => {
  it("upserts, then deletes on null; scoped per persona", async () => {
    const res = await patch({ cif: CIF, changes: { t1: { categoryId: "dining", origin: "user" }, t2: { hidden: true } } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.t1).toMatchObject({ categoryId: "dining", origin: "user" });
    expect(body.t2).toMatchObject({ hidden: true });
    expect(await (await get("?cif=CIF_0002")).json()).toEqual({});

    await patch({ cif: CIF, changes: { t1: { categoryId: "transport", origin: "user" }, t2: null } });
    const after = await (await get(`?cif=${CIF}`)).json();
    expect(after).toEqual({ t1: expect.objectContaining({ categoryId: "transport" }) });
    expect(rowCount()).toBe(1);
  });

  it("normalizes a legacy bare-string record into a user correction (provenance default)", async () => {
    const body = await (await patch({ cif: CIF, changes: { t1: "transport" } })).json();
    expect(body.t1).toEqual({ categoryId: "transport", origin: "user", status: "applied" });
  });

  it("rejects the whole batch on an unknown category id — nothing partial lands", async () => {
    const res = await patch({ cif: CIF, changes: { t1: { categoryId: "dining" }, t2: { categoryId: "made-up" } } });
    expect(res.status).toBe(422);
    expect((await res.json()).invalidCategoryIds).toEqual(["made-up"]);
    expect(rowCount()).toBe(0);
  });

  it("user wins: an AI/memory record never overwrites a user label", async () => {
    await patch({ cif: CIF, changes: { t1: { categoryId: "groceries", origin: "user" } } });
    const body = await (
      await patch({ cif: CIF, changes: { t1: { categoryId: "dining", origin: "ai", status: "applied" }, t2: { categoryId: "dining", origin: "ai" } } })
    ).json();
    expect(body.t1).toMatchObject({ categoryId: "groceries", origin: "user" });
    expect(body.t2).toMatchObject({ categoryId: "dining", origin: "ai" });
    // a user record may replace an AI one
    const next = await (await patch({ cif: CIF, changes: { t2: { categoryId: "transport", origin: "user" } } })).json();
    expect(next.t2).toMatchObject({ categoryId: "transport", origin: "user" });
  });

  it("validates the request shape", async () => {
    expect((await patch("{not json")).status).toBe(400);
    expect((await patch({ changes: {} })).status).toBe(422);
    expect((await patch({ cif: CIF, changes: [] })).status).toBe(422);
    const tooMany = Object.fromEntries(Array.from({ length: MAX_CHANGES + 1 }, (_, i) => [`t${i}`, null]));
    expect((await patch({ cif: CIF, changes: tooMany })).status).toBe(413);
  });
});
