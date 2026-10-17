// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Account, Transaction } from "@/domain/models";

/**
 * Route-level integration for `/api/accounts/debit` (H14/U1): the REAL
 * `accounts-store` + `manual-txns-store` over an in-memory SQLite built from the
 * real `data/schema.sql`. The debit and the transfer's primary record are ONE
 * DB transaction — both land or neither does — and a replay of the same record
 * never debits twice. `server-only` is neutralised (it throws outside RSC).
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { POST } from "../debit/route";
import { readAccounts } from "@/lib/accounts-store";

const CIF = "CIF_0001";
const SCHEMA = readFileSync(join(process.cwd(), "data", "schema.sql"), "utf8");

function record(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "xfer-1",
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

function debit(body: unknown): Promise<Response> {
  return POST(new NextRequest("http://localhost/api/accounts/debit", { method: "POST", body: JSON.stringify(body) }));
}

function storedTxnIds(): string[] {
  return (holder.db!.prepare("SELECT id FROM transactions WHERE cif = ? AND source = 'self_reported'").all(CIF) as { id: string }[]).map((r) => r.id);
}

let casa: Account;

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
  casa = readAccounts(CIF).find((a) => a.type === "current")!;
});

describe("POST /api/accounts/debit — H14/U1 atomic debit + record", () => {
  it("debits the account AND stores the record together", async () => {
    const res = await debit({ cif: CIF, accountId: casa.id, amount: 500_000, txn: record() });
    expect(res.status).toBe(200);
    const accounts = (await res.json()) as Account[];
    expect(accounts.find((a) => a.id === casa.id)?.availableBalance).toBe(casa.availableBalance - 500_000);
    expect(storedTxnIds()).toEqual(["xfer-1"]);
  });

  it("replaying the same record never debits twice (idempotent on the record id)", async () => {
    await debit({ cif: CIF, accountId: casa.id, amount: 500_000, txn: record() });
    const res = await debit({ cif: CIF, accountId: casa.id, amount: 500_000, txn: record() });
    expect(res.status).toBe(200);
    expect(readAccounts(CIF).find((a) => a.id === casa.id)?.availableBalance).toBe(casa.availableBalance - 500_000);
    expect(storedTxnIds()).toEqual(["xfer-1"]);
  });

  it("an unknown account rolls back: 404 and NO record stored", async () => {
    const res = await debit({ cif: CIF, accountId: "ghost", amount: 500_000, txn: record() });
    expect(res.status).toBe(404);
    expect(storedTxnIds()).toEqual([]);
  });

  it("a failed record insert rolls the debit back (500, balance untouched)", async () => {
    holder.db!.exec(
      "CREATE TRIGGER fail_record BEFORE INSERT ON transactions WHEN NEW.source = 'self_reported' BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    const res = await debit({ cif: CIF, accountId: casa.id, amount: 500_000, txn: record() });
    expect(res.status).toBe(500);
    expect(readAccounts(CIF).find((a) => a.id === casa.id)?.availableBalance).toBe(casa.availableBalance);
  });

  it("a record id owned by a bank row is a 409: no debit, bank row untouched (#5)", async () => {
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, 'xfer-1', 'mock', ?, '{}')")
      .run(CIF, "2026-09-01T00:00:00.000Z");
    const res = await debit({ cif: CIF, accountId: casa.id, amount: 500_000, txn: record() });
    expect(res.status).toBe(409);
    expect(readAccounts(CIF).find((a) => a.id === casa.id)?.availableBalance).toBe(casa.availableBalance);
    expect(storedTxnIds()).toEqual([]);
    const bank = holder.db!.prepare("SELECT payload FROM transactions WHERE cif = ? AND id = 'xfer-1'").get(CIF) as { payload: string };
    expect(bank.payload).toBe("{}");
  });

  it("rejects a record whose amount does not match the debit (422, nothing moves)", async () => {
    const res = await debit({ cif: CIF, accountId: casa.id, amount: 500_000, txn: record({ amount: 1 }) });
    expect(res.status).toBe(422);
    expect(readAccounts(CIF).find((a) => a.id === casa.id)?.availableBalance).toBe(casa.availableBalance);
    expect(storedTxnIds()).toEqual([]);
  });

  it("still debits without a record (legacy callers)", async () => {
    const res = await debit({ cif: CIF, accountId: casa.id, amount: 200_000 });
    expect(res.status).toBe(200);
    expect(readAccounts(CIF).find((a) => a.id === casa.id)?.availableBalance).toBe(casa.availableBalance - 200_000);
  });
});
