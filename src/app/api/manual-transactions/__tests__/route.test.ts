// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Transaction } from "@/domain/models";

/**
 * Route-level integration for `/api/manual-transactions` — the SQLite-backed
 * persistence for self-reported txns (the ＋ FAB + transfer success card). Runs
 * the REAL store against an in-memory DB so create → list → patch → delete and
 * the `null`-means-clear semantics are load-bearing, not just inspected. These
 * rows are `source: "self_reported"` (never bank-verified — #5) and are NEVER
 * money movement (#3).
 *
 * `@/lib/db` is mocked to an in-memory SQLite so the real `manual-txns-store`
 * runs; `server-only` is neutralised (it throws outside a Server Component).
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET, POST, PATCH, DELETE } from "../route";

const CIF = "CIF_0001";

const DDL = `CREATE TABLE manual_transactions (
  cif TEXT NOT NULL, id TEXT NOT NULL, posted_at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (cif, id)
);`;

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "manual-1",
    accountId: "self-reported",
    postedAt: "2026-09-15T10:00:00.000Z",
    amount: 500_000,
    currency: "VND",
    direction: "debit",
    type: "transfer",
    merchantName: "Nguyen Van A",
    merchantNormalizedName: "nguyen van a",
    categoryId: "transfer",
    status: "posted",
    source: "self_reported",
    isRecurring: false,
    userEdited: true,
    transferPurpose: "family",
    ...over,
  };
}

function post(body: unknown): Promise<Response> {
  return POST(new NextRequest("http://localhost/api/manual-transactions", { method: "POST", body: JSON.stringify(body) }));
}
function patch(body: unknown): Promise<Response> {
  return PATCH(new NextRequest("http://localhost/api/manual-transactions", { method: "PATCH", body: JSON.stringify(body) }));
}
function list(cif: string | null = CIF): Promise<Response> {
  const url = cif ? `http://localhost/api/manual-transactions?cif=${cif}` : "http://localhost/api/manual-transactions";
  return GET(new NextRequest(url));
}
function del(id: string, cif: string | null = CIF): Promise<Response> {
  const url = cif
    ? `http://localhost/api/manual-transactions?cif=${cif}&id=${id}`
    : `http://localhost/api/manual-transactions?id=${id}`;
  return DELETE(new NextRequest(url, { method: "DELETE" }));
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(DDL);
});

describe("/api/manual-transactions", () => {
  it("422s when cif is missing", async () => {
    expect((await list(null)).status).toBe(422);
    expect((await post({ txn: txn() })).status).toBe(422);
  });

  it("422s when the txn shape is invalid", async () => {
    expect((await post({ cif: CIF, txn: { id: 1 } })).status).toBe(422);
  });

  it("persists a created txn and lists it back (newest first, self_reported)", async () => {
    expect((await post({ cif: CIF, txn: txn({ id: "manual-old", postedAt: "2026-09-10T00:00:00.000Z" }) })).status).toBe(201);
    expect((await post({ cif: CIF, txn: txn({ id: "manual-new", postedAt: "2026-09-20T00:00:00.000Z" }) })).status).toBe(201);
    const rows = (await (await list()).json()) as Transaction[];
    expect(rows.map((t) => t.id)).toEqual(["manual-new", "manual-old"]);
    expect(rows.every((t) => t.source === "self_reported")).toBe(true);
  });

  it("forces source to self_reported even if the client claims otherwise (#5)", async () => {
    await post({ cif: CIF, txn: txn({ source: "msb" as Transaction["source"] }) });
    const rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].source).toBe("self_reported");
  });

  it("patches category/type and reflects it on list", async () => {
    await post({ cif: CIF, txn: txn() });
    const res = await patch({ cif: CIF, id: "manual-1", patch: { categoryId: "dining", type: "expense" } });
    expect(res.status).toBe(200);
    const rows = (await (await list()).json()) as Transaction[];
    expect(rows[0]).toMatchObject({ categoryId: "dining", type: "expense", userEdited: true });
  });

  it("clears transferPurpose when patched with null", async () => {
    await post({ cif: CIF, txn: txn() }); // has transferPurpose: family
    await patch({ cif: CIF, id: "manual-1", patch: { categoryId: "dining", type: "expense", transferPurpose: null } });
    const rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].transferPurpose).toBeUndefined();
  });

  it("404s when patching an unknown id", async () => {
    expect((await patch({ cif: CIF, id: "nope", patch: { categoryId: "dining" } })).status).toBe(404);
  });

  it("drops mistyped patch fields instead of corrupting the payload", async () => {
    await post({ cif: CIF, txn: txn({ categoryId: "transfer", type: "transfer" }) });
    // categoryId is a number, type is an object — both must be ignored, note applied.
    await patch({ cif: CIF, id: "manual-1", patch: { categoryId: 123, type: {}, note: "ok" } });
    const rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].categoryId).toBe("transfer"); // unchanged, not 123
    expect(rows[0].type).toBe("transfer"); // unchanged, not {}
    expect(rows[0].note).toBe("ok"); // the one valid field applied
  });

  it("round-trips a rebalance txn's meta through create → list (Phase 03 allowlist)", async () => {
    const rebalance = { fromJarId: "savings", toJarId: "food", triggerTxnId: "manual-trigger", origin: "auto" as const };
    await post({ cif: CIF, txn: txn({ id: "manual-rb", categoryId: "dieu-chinh-hu", rebalance }) });
    const rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].categoryId).toBe("dieu-chinh-hu");
    expect(rows[0].rebalance).toEqual(rebalance); // survives POST payload round-trip, not dropped
  });

  it("patches rebalance meta and clears it with null (Phase 03 allowlist)", async () => {
    await post({ cif: CIF, txn: txn({ id: "manual-rb2" }) });
    const rebalance = { fromJarId: "buffer", toJarId: "pool", triggerTxnId: "t2", origin: "manual" as const };
    await patch({ cif: CIF, id: "manual-rb2", patch: { rebalance } });
    let rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].rebalance).toEqual(rebalance);
    // A malformed rebalance patch is dropped, not written (shape guard).
    await patch({ cif: CIF, id: "manual-rb2", patch: { rebalance: { fromJarId: 1 } } });
    rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].rebalance).toEqual(rebalance); // unchanged
    // null clears it (Phase 05 unwind).
    await patch({ cif: CIF, id: "manual-rb2", patch: { rebalance: null } });
    rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].rebalance).toBeUndefined();
  });

  it("deletes a txn (204) and it disappears from the list", async () => {
    await post({ cif: CIF, txn: txn() });
    expect((await del("manual-1")).status).toBe(204);
    expect(((await (await list()).json()) as Transaction[]).length).toBe(0);
  });

  it("isolates rows per cif", async () => {
    await post({ cif: CIF, txn: txn({ id: "a" }) });
    await post({ cif: "CIF_OTHER", txn: txn({ id: "b" }) });
    expect(((await (await list("CIF_OTHER")).json()) as Transaction[]).map((t) => t.id)).toEqual(["b"]);
  });
});
