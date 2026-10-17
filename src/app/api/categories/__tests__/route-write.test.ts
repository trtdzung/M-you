// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { JarConfig } from "@/domain/models";

/**
 * The `/api/categories` write doors (plan 260920-1019 Phase 02): POST create,
 * PATCH rename/archive, DELETE. Real handlers + real stores over an in-memory DB
 * built from `data/schema.sql`. Every write answers with the WHOLE resulting
 * aggregate `{ categories, jarConfig }`, so each assertion below reads the
 * server's truth rather than a client-side hope.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET, POST } from "../route";
import { DELETE, PATCH } from "../[id]/route";
import { PATCH as patchJar } from "../../jars/[id]/route";
import { writeJarConfig } from "@/lib/jars-store";
import { knownCategoryIds } from "@/lib/categories-store";

const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");
const CIF = "CIF_0001";
const BASE = "http://localhost/api/categories";

type Aggregate = { categories: Array<{ id: string; label: string; archived?: true }>; jarConfig: JarConfig };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => POST(new NextRequest(BASE, { method: "POST", body: JSON.stringify(body) }));
const patch = (id: string, patchBody: unknown, cif = CIF) =>
  PATCH(new NextRequest(`${BASE}/${id}?cif=${cif}`, { method: "PATCH", body: JSON.stringify({ patch: patchBody }) }), ctx(id));
const del = (id: string, cif = CIF) =>
  DELETE(new NextRequest(`${BASE}/${id}?cif=${cif}`, { method: "DELETE" }), ctx(id));
const get = (query = `?cif=${CIF}`) => GET(new NextRequest(`${BASE}${query}`));

const jarOf = (config: JarConfig, categoryId: string) =>
  config.jars.find((j) => j.categoryIds.includes(categoryId))?.id;

/** POST a label and return the created id + the response aggregate. */
async function create(label: string, extra: Record<string, unknown> = {}): Promise<[string, Aggregate]> {
  const res = await post({ cif: CIF, label, ...extra });
  expect(res.status).toBe(201);
  const body = (await res.json()) as Aggregate;
  const created = body.categories.find((c) => c.label === label);
  expect(created).toBeDefined();
  return [created!.id, body];
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("POST /api/categories", () => {
  it("creates a c_-prefixed category and the response already shows it in Khác", async () => {
    const [id, body] = await create("Học phí");
    expect(id).toBe("c_hoc-phi");
    expect(jarOf(body.jarConfig, id)).toBe("khac");
    expect((await (await get()).json()).map((c: { id: string }) => c.id)).toContain(id);
  });

  it("lands the category in the requested jar, not Khác", async () => {
    writeJarConfig(CIF, { version: 3, jars: [{ id: "study", label: "Học", categoryIds: ["subscriptions"] }] });
    const [id, body] = await create("Học phí", { jarId: "study" });
    expect(jarOf(body.jarConfig, id)).toBe("study");
    expect(body.jarConfig.jars.find((j) => j.id === "study")?.categoryIds).toContain("subscriptions");
  });

  it("404s an unknown jarId and 422s a reserved one — and writes nothing", async () => {
    expect((await post({ cif: CIF, label: "Học phí", jarId: "nope" })).status).toBe(404);
    expect((await post({ cif: CIF, label: "Học phí", jarId: "pool" })).status).toBe(422);
    expect((await (await get()).json()).some((c: { label: string }) => c.label === "Học phí")).toBe(false);
  });

  it("409s a duplicate label, whether the holder is active or archived", async () => {
    const [id] = await create("Học phí");
    const dup = await post({ cif: CIF, label: "  học phí  " });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: "duplicate label" });

    expect((await patch(id, { archived: true })).status).toBe(200);
    expect((await post({ cif: CIF, label: "Học phí" })).status).toBe(409);
  });

  it.each([
    ["missing cif", { label: "Học phí" }],
    ["empty label", { cif: CIF, label: "" }],
    ["whitespace label", { cif: CIF, label: "   " }],
    ["41-char label", { cif: CIF, label: "a".repeat(41) }],
    ["transfer kind", { cif: CIF, label: "Học phí", kind: "transfer" }],
    ["non-boolean fixed", { cif: CIF, label: "Học phí", fixed: "yes" }],
  ])("422s on %s", async (_name, body) => {
    expect((await post(body)).status).toBe(422);
  });

  it("ignores a client-supplied id — it always comes from the slug", async () => {
    const [id] = await create("Học phí", { id: "dining" });
    expect(id).toBe("c_hoc-phi");
  });
});

describe("PATCH /api/categories/:id", () => {
  it("renames a custom category", async () => {
    const [id] = await create("Học phí");
    const res = await patch(id, { label: "Học hành" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Aggregate;
    expect(body.categories.find((c) => c.id === id)?.label).toBe("Học hành");
  });

  it("403s a built-in, 404s an unknown id, 409s a rename onto an existing label", async () => {
    const [id] = await create("Học phí");
    await create("Quà tặng");
    expect((await patch("dining", { label: "Đổi" })).status).toBe(403);
    expect((await patch("c_nope", { label: "Đổi" })).status).toBe(404);
    expect((await patch(id, { label: "Quà tặng" })).status).toBe(409);
  });

  it("ignores patch.id — the id is the path and never changes", async () => {
    const [id] = await create("Học phí");
    const body = (await (await patch(id, { id: "c_hacked", label: "Học hành" })).json()) as Aggregate;
    expect(body.categories.map((c) => c.id)).toContain(id);
    expect(body.categories.map((c) => c.id)).not.toContain("c_hacked");
  });

  it("422s a malformed patch instead of silently dropping the field", async () => {
    const [id] = await create("Học phí");
    expect((await patch(id, { label: "" })).status).toBe(422);
    expect((await patch(id, { archived: "yes" })).status).toBe(422);
    expect((await patch(id, "nope")).status).toBe(422);
    expect((await PATCH(new NextRequest(`${BASE}/${id}`, { method: "PATCH", body: "{}" }), ctx(id))).status).toBe(422);
  });

  it("archiving hides it from GET, keeps it known, and leaves its jar untouched", async () => {
    writeJarConfig(CIF, { version: 3, jars: [{ id: "study", label: "Học", categoryIds: ["subscriptions"] }] });
    const [id] = await create("Học phí", { jarId: "study" });

    const body = (await (await patch(id, { archived: true })).json()) as Aggregate;
    expect(body.categories.map((c) => c.id)).not.toContain(id);
    expect(jarOf(body.jarConfig, id)).toBe("study"); // heal only ever ADDS — nothing was yanked
    expect(body.jarConfig.jars.find((j) => j.id === "study")?.categoryIds).toEqual(["subscriptions", id]);
    expect(knownCategoryIds(CIF).has(id)).toBe(true);

    const archived = (await (await get(`?cif=${CIF}&includeArchived=1`)).json()) as Array<{ id: string; archived?: true }>;
    expect(archived.find((c) => c.id === id)?.archived).toBe(true);
  });

  it("un-archives back into the taxonomy", async () => {
    const [id] = await create("Học phí");
    expect((await patch(id, { archived: true })).status).toBe(200);
    const body = (await (await patch(id, { archived: false })).json()) as Aggregate;
    expect(body.categories.find((c) => c.id === id)?.archived).toBeUndefined();
    expect(jarOf(body.jarConfig, id)).toBe("khac");
  });

  it("re-runs the duplicate-label check on un-archive", async () => {
    // The API alone cannot produce this collision (the create/rename checks
    // already count archived labels). A hand-edited row can — and that is
    // exactly the state the un-archive check exists to refuse, rather than
    // letting two identical labels into the picker.
    const [id] = await create("Học phí");
    const [other] = await create("Quà tặng");
    expect((await patch(id, { archived: true })).status).toBe(200);
    holder.db!.prepare("UPDATE categories SET label = ? WHERE cif = ? AND id = ?").run("Học phí", CIF, other);

    expect((await patch(id, { archived: false })).status).toBe(409);
    expect((await patch(other, { label: "Quà tặng" })).status).toBe(200);
    expect((await patch(id, { archived: false })).status).toBe(200);
  });
});

describe("DELETE /api/categories/:id", () => {
  it("removes an unused custom category from the taxonomy and from its jar", async () => {
    writeJarConfig(CIF, { version: 3, jars: [{ id: "study", label: "Học", categoryIds: ["subscriptions"] }] });
    const [id] = await create("Học phí", { jarId: "study" });

    const res = await del(id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Aggregate;
    expect(body.categories.map((c) => c.id)).not.toContain(id);
    expect(body.jarConfig.jars.flatMap((j) => j.categoryIds)).not.toContain(id);
    expect(body.jarConfig.jars.find((j) => j.id === "study")?.categoryIds).toEqual(["subscriptions"]);
  });

  it("409s with the exact usedBy count and keeps everything", async () => {
    const [id] = await create("Học phí");
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
      .run(CIF, "t1", "2026-09-01T00:00:00.000Z", JSON.stringify({ id: "t1", categoryId: id }));
    holder.db!
      .prepare("INSERT INTO transaction_corrections (cif, txn_id, payload, updated_at) VALUES (?, ?, ?, ?)")
      .run(CIF, "t2", JSON.stringify({ categoryId: id, origin: "user" }), "now");

    const res = await del(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "category in use", usedBy: 2 });
    expect((await (await get()).json()).map((c: { id: string }) => c.id)).toContain(id);
  });

  it("403s a built-in and 422s a missing cif", async () => {
    expect((await del("dining")).status).toBe(403);
    expect((await DELETE(new NextRequest(`${BASE}/dining`, { method: "DELETE" }), ctx("dining"))).status).toBe(422);
  });
});

describe("a freshly created category is immediately assignable to a jar", () => {
  it("PATCH /api/jars/:id accepts it (200, not 422)", async () => {
    writeJarConfig(CIF, { version: 3, jars: [{ id: "study", label: "Học", categoryIds: [] }] });
    const [id] = await create("Học phí");

    const res = await patchJar(
      new NextRequest(`http://localhost/api/jars/study?cif=${CIF}`, {
        method: "PATCH",
        body: JSON.stringify({ patch: { categoryIds: [id] } }),
      }),
      ctx("study"),
    );
    expect(res.status).toBe(200);
    expect(jarOf((await res.json()) as JarConfig, id)).toBe("study");
  });
});
