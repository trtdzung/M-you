// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as Db } from "better-sqlite3";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("./../db", () => ({ getDb: () => holder.db! }));

import { readTransactions } from "../transactions-store";

describe("bổ sung các ngày còn thiếu cho persona đã seed từ mốc cũ", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "topup-"));
    const copy = path.join(dir, "old.sqlite3");
    const src = path.join(process.cwd(), "data", "pfm.sqlite3");
    copyFileSync(src, copy);
    const db = new Database(copy);
    // Mô phỏng DB seed từ mốc cũ: bỏ mọi giao dịch sinh sau 15/09/2026.
    db.prepare("DELETE FROM transactions WHERE source <> 'self_reported' AND id LIKE 'tx\\_%' ESCAPE '\\' AND posted_at > '2026-09-15T23:59:59.999Z'").run();
    holder.db = db;
  });

  afterAll(() => {
    holder.db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("thêm giao dịch tới 21/10/2026, không trùng id, chạy lại không thêm nữa", () => {
    const db = holder.db!;
    const before = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = 'CIF_0001'").get() as { n: number };
    const first = readTransactions("CIF_0001");
    const after = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = 'CIF_0001'").get() as { n: number };
    expect(after.n).toBeGreaterThan(before.n);
    expect(first.some((t) => t.postedAt >= "2026-10-01")).toBe(true);
    expect(first.some((t) => t.postedAt > "2026-10-21T23:59:59Z")).toBe(false);
    expect(first.some((t) => t.postedAt > "2026-09-15T23:59:59Z" && t.postedAt < "2026-10-01")).toBe(true);
    expect(new Set(first.map((t) => t.id)).size).toBe(first.length);
    readTransactions("CIF_0001");
    const again = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = 'CIF_0001'").get() as { n: number };
    expect(again.n).toBe(after.n);
  });
});
