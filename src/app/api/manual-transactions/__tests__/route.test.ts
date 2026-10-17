// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const SCHEMA = readFileSync(join(process.cwd(), "data", "schema.sql"), "utf8");

/** A bank-provided (`mock`) row sharing the one `transactions` table. */
function insertBankRow(id: string, cif = CIF): void {
  const payload = JSON.stringify(txn({ id, source: "mock" as Transaction["source"], merchantName: "BANK" }));
  holder.db!
    .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
    .run(cif, id, "2026-09-01T00:00:00.000Z", payload);
}
const bankPayload = (id: string) =>
  (holder.db!.prepare("SELECT payload FROM transactions WHERE cif = ? AND id = ? AND source = 'mock'").get(CIF, id) as
    | { payload: string }
    | undefined)?.payload;

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
  holder.db.exec(SCHEMA);
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
    // A malformed rebalance patch is REJECTED (F15) — 422, nothing written.
    expect((await patch({ cif: CIF, id: "manual-rb2", patch: { rebalance: { fromJarId: 1 } } })).status).toBe(422);
    const partial = { fromJarId: "food", toJarId: "", triggerTxnId: "t2", origin: "manual" };
    expect((await patch({ cif: CIF, id: "manual-rb2", patch: { rebalance: partial } })).status).toBe(422);
    rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].rebalance).toEqual(rebalance); // unchanged
    // null clears it (Phase 05 unwind).
    await patch({ cif: CIF, id: "manual-rb2", patch: { rebalance: null } });
    rows = (await (await list()).json()) as Transaction[];
    expect(rows[0].rebalance).toBeUndefined();
  });

  it.each([
    ["missing toJarId/triggerTxnId/origin", { fromJarId: "food" }],
    ["bogus origin", { fromJarId: "food", toJarId: "savings", triggerTxnId: "t", origin: "bogus-origin" }],
    ["empty fromJarId", { fromJarId: "", toJarId: "savings", triggerTxnId: "t", origin: "auto" }],
    ["null meta", null],
  ])("422s a POST with malformed rebalance meta: %s (F15)", async (_label, rebalance) => {
    const res = await post({ cif: CIF, txn: { ...txn({ id: "bad", categoryId: "dieu-chinh-hu" }), rebalance } });
    expect(res.status).toBe(422);
    expect(((await (await list()).json()) as Transaction[]).length).toBe(0);
  });

  it.each([0, -5])("422s a rebalance leg whose amount is %d (F15)", async (amount) => {
    const rebalance = { fromJarId: "food", toJarId: "savings", triggerTxnId: "t", origin: "auto" as const };
    expect((await post({ cif: CIF, txn: txn({ id: "bad", amount, rebalance }) })).status).toBe(422);
  });

  it("counts the rebalance legs referencing a jar (?jarId=) for the pre-delete warning", async () => {
    const leg = (from: string, to: string) => ({ fromJarId: from, toJarId: to, triggerTxnId: "t", origin: "auto" as const });
    await post({ cif: CIF, txn: txn({ id: "l1", rebalance: leg("savings", "food") }) });
    await post({ cif: CIF, txn: txn({ id: "l2", rebalance: leg("pool", "savings") }) });
    await post({ cif: CIF, txn: txn({ id: "l3", rebalance: leg("pool", "food") }) });
    await post({ cif: "CIF_OTHER", txn: txn({ id: "l4", rebalance: leg("savings", "food") }) });
    const res = await GET(new NextRequest(`http://localhost/api/manual-transactions?cif=${CIF}&jarId=savings`));
    expect(await res.json()).toEqual({ jarId: "savings", rebalanceLegCount: 2 });
  });

  it("deletes a txn (204) and it disappears from the list", async () => {
    await post({ cif: CIF, txn: txn() });
    expect((await del("manual-1")).status).toBe(204);
    expect(((await (await list()).json()) as Transaction[]).length).toBe(0);
  });

  describe("shares the one transactions table with bank rows (#5)", () => {
    it("never lists a bank row", async () => {
      insertBankRow("bank-1");
      await post({ cif: CIF, txn: txn() });
      expect(((await (await list()).json()) as Transaction[]).map((t) => t.id)).toEqual(["manual-1"]);
    });

    it("409s a POST whose id belongs to a bank row and leaves that row untouched", async () => {
      insertBankRow("bank-1");
      const before = bankPayload("bank-1");
      expect((await post({ cif: CIF, txn: txn({ id: "bank-1" }) })).status).toBe(409);
      expect(bankPayload("bank-1")).toBe(before);
    });

    it("cannot patch or delete a bank row", async () => {
      insertBankRow("bank-1");
      const before = bankPayload("bank-1");
      expect((await patch({ cif: CIF, id: "bank-1", patch: { categoryId: "dining" } })).status).toBe(404);
      await del("bank-1");
      expect(bankPayload("bank-1")).toBe(before);
    });
  });

  it("isolates rows per cif", async () => {
    await post({ cif: CIF, txn: txn({ id: "a" }) });
    await post({ cif: "CIF_OTHER", txn: txn({ id: "b" }) });
    expect(((await (await list("CIF_OTHER")).json()) as Transaction[]).map((t) => t.id)).toEqual(["b"]);
  });
});
