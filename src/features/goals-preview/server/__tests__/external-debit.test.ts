// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { Transaction } from "@/domain/models";
import { CIF, openGoalFixtureDb, txnBase, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { POST } from "@/app/api/accounts/debit/route";
import { readAccounts } from "@/lib/accounts-store";
import { NextRequest } from "next/server";

process.env.AGENT_MODE = "mock";

describe("D28 đường chuyển ra ngoài từ TK thường (debitAccount kẹp ≥ 0)", () => {
  let fx: GoalFixture;
  let mainId: string;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
    mainId = readAccounts(CIF).find((a) => a.type === "current")!.id;
  });

  afterAll(() => fx.close());

  it("vượt số dư vẫn 200 và kẹp số dư về 0 (hành vi cũ của team)", async () => {
    const main = readAccounts(CIF).find((a) => a.id === mainId)!;
    const amount = main.availableBalance + 500_000;
    const txn = txnBase({
      id: "ext-clamp",
      accountId: mainId,
      postedAt: "2026-10-17T08:00:00.000Z",
      amount,
      direction: "debit",
      type: "expense",
      categoryId: "shopping",
      merchantName: "External",
      counterpartyAccountNumber: "1900123456789",
      counterpartyBankName: "Vietcombank",
    }) as Transaction;
    const res = await POST(
      new NextRequest("http://test/api/accounts/debit", {
        method: "POST",
        body: JSON.stringify({ cif: CIF, accountId: mainId, amount, txn }),
      }),
    );
    expect(res.status).toBe(200);
    const after = readAccounts(CIF).find((a) => a.id === mainId)!;
    expect(after.balance).toBe(0);
    expect(after.availableBalance).toBe(0);
  });
});
