// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATEGORIES } from "@/domain/models";

/**
 * Route-level integration for `GET /api/categories` — the stored taxonomy,
 * lazily seeded PER CIF from `CATEGORIES` into an in-memory DB built from
 * `data/schema.sql`.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET } from "../route";

const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");
const CIF = "CIF_0001";

const get = (query = `?cif=${CIF}`) => GET(new NextRequest(`http://localhost/api/categories${query}`));

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("GET /api/categories", () => {
  it("seeds the taxonomy on first read, in display order", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CATEGORIES.map((c) => ({ id: c.id, label: c.label, kind: c.kind, fixed: !!c.fixed })));
  });

  it("never clobbers a stored row on later reads, and does not duplicate", async () => {
    await get();
    const first = CATEGORIES[0].id;
    holder.db!.prepare("UPDATE categories SET label = ? WHERE cif = ? AND id = ?").run("Đã đổi tên", CIF, first);
    const body = (await (await get()).json()) as Array<{ id: string; label: string }>;
    expect(body.find((c) => c.id === first)?.label).toBe("Đã đổi tên");
    expect(body).toHaveLength(CATEGORIES.length);
  });

  it("422 without cif", async () => {
    expect((await get("")).status).toBe(422);
  });

  it("500 when the DB is unavailable", async () => {
    holder.db = null;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(500);
    spy.mockRestore();
  });
});
