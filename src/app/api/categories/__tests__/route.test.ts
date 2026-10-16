// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATEGORIES } from "@/domain/models";

/**
 * Route-level integration for `GET /api/categories` — the stored taxonomy,
 * lazily seeded from `CATEGORIES` into an in-memory DB built from `data/schema.sql`.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET } from "../route";

const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("GET /api/categories", () => {
  it("seeds the taxonomy on first read, in display order", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CATEGORIES.map((c) => ({ id: c.id, label: c.label, kind: c.kind, fixed: !!c.fixed })));
  });

  it("never clobbers a stored row on later reads, and does not duplicate", async () => {
    await GET();
    const first = CATEGORIES[0].id;
    holder.db!.prepare("UPDATE categories SET label = ? WHERE id = ?").run("Đã đổi tên", first);
    const body = (await (await GET()).json()) as Array<{ id: string; label: string }>;
    expect(body.find((c) => c.id === first)?.label).toBe("Đã đổi tên");
    expect(body).toHaveLength(CATEGORIES.length);
  });

  it("500 when the DB is unavailable", async () => {
    holder.db = null;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET()).status).toBe(500);
    spy.mockRestore();
  });
});
