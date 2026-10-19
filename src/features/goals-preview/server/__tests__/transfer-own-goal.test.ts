// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { Transaction } from "@/domain/models";
import { CIF, balancesOf, goalInput, openGoalFixtureDb, txnBase, type GoalFixture } from "./helpers/goal-test-db";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { POST } from "@/app/api/accounts/debit/route";
import { readAccounts } from "@/lib/accounts-store";
import { applyAction, getWorld } from "../goal-service";

process.env.AGENT_MODE = "mock";

describe("Chuyển nội bộ tới TK mục tiêu (D22–D24, D29, D30, F4)", () => {
  let fx: GoalFixture;
  let mainId: string;
  let goalAccId: string;
  let goalNumber: string;
  let savingsId: string | undefined;
  let seq = 0;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
    const created = applyAction(CIF, "xfer-create", { type: "createGoal", input: goalInput("xfer") });
    expect(created.ok).toBe(true);
    const gid = created.ok ? created.createdGoalId! : "";
    const opened = applyAction(CIF, "xfer-open", { type: "openAccount", goalId: gid, initialDeposit: 100_000 });
    expect(opened.ok).toBe(true);
    const accounts = readAccounts(CIF);
    mainId = accounts.find((a) => a.type === "current")!.id;
    const ga = accounts.find((a) => a.type === "goal")!;
    goalAccId = ga.id;
    goalNumber = ga.accountNumber;
    savingsId = accounts.find((a) => a.type === "savings")?.id;
  });

  afterAll(() => fx.close());

  function baseTxn(overrides: Partial<Transaction> = {}): Transaction {
    return txnBase({
      id: `xfer-${++seq}`,
      accountId: mainId,
      postedAt: "2026-12-24T06:00:00.000Z",
      amount: 100,
      direction: "debit",
      type: "transfer",
      categoryId: "transfer",
      merchantName: "Review",
      counterpartyAccountNumber: goalNumber,
      counterpartyBankName: "MSB",
      ...overrides,
    }) as Transaction;
  }

  async function debit(txn: Transaction, amount = txn.amount, source = mainId) {
    const res = await POST(
      new NextRequest("http://test/api/accounts/debit", {
        method: "POST",
        body: JSON.stringify({ cif: CIF, accountId: source, amount, txn }),
      }),
    );
    return { status: res.status, body: await res.json() };
  }

  it("thiếu số dư → 422, không ghi", async () => {
    const main = readAccounts(CIF).find((a) => a.id === mainId)!;
    const before = balancesOf(CIF, readAccounts);
    const txn = baseTxn({ amount: main.availableBalance + 1000 });
    const result = await debit(txn);
    expect(result.status).toBe(422);
    expect(balancesOf(CIF, readAccounts)).toEqual(before);
    const rows = fx.db.prepare("SELECT id FROM transactions WHERE cif = ? AND id LIKE ?").all(CIF, `${txn.id}%`);
    expect(rows).toHaveLength(0);
  });

  it("chuyển thành công: 2 chân cùng transferGroupId; replay giống → 200 không ghi thêm; đổi tiền/số nhận/NH/nguồn → 409", async () => {
    const txn = baseTxn({ id: "xfer-success", amount: 100 });
    const before = balancesOf(CIF, readAccounts);
    const ok = await debit(txn);
    expect(ok.status).toBe(200);
    const after = balancesOf(CIF, readAccounts);
    expect(after[mainId]).toBe(before[mainId] - 100);
    expect(after[goalAccId]).toBe(before[goalAccId] + 100);

    const legs = fx.db
      .prepare("SELECT payload FROM transactions WHERE cif = ? AND (id = ? OR id = ?)")
      .all(CIF, txn.id, `${txn.id}-credit`)
      .map((r) => JSON.parse((r as { payload: string }).payload) as Transaction);
    expect(legs).toHaveLength(2);
    expect(legs[0].transferGroupId).toBeTruthy();
    expect(legs[0].transferGroupId).toBe(legs[1].transferGroupId);
    expect(legs[0].transferGroupId!.startsWith("gtg-")).toBe(true);

    const countBefore = (
      fx.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ? AND id LIKE ?").get(CIF, `${txn.id}%`) as {
        n: number;
      }
    ).n;
    const same = await debit(txn);
    expect(same.status).toBe(200);
    expect(
      (fx.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ? AND id LIKE ?").get(CIF, `${txn.id}%`) as { n: number })
        .n,
    ).toBe(countBefore);
    expect(balancesOf(CIF, readAccounts)).toEqual(after);

    expect((await debit({ ...txn, amount: 999_999 }, 999_999)).status).toBe(409);
    expect((await debit({ ...txn, counterpartyAccountNumber: "000000000000" })).status).toBe(409);
    expect((await debit({ ...txn, counterpartyBankName: "OTHER BANK" })).status).toBe(409);
    if (savingsId) {
      const bal = balancesOf(CIF, readAccounts);
      expect((await debit(txn, txn.amount, savingsId)).status).toBe(409);
      expect(balancesOf(CIF, readAccounts)).toEqual(bal);
    }
  });

  it("ngân hàng khác MSB → không cộng TK mục tiêu (đi đường debitAccount)", async () => {
    const txn = baseTxn({ id: "xfer-otherbank", counterpartyBankName: "Vietcombank", amount: 50 });
    const before = balancesOf(CIF, readAccounts);
    const result = await debit(txn);
    expect(result.status).toBe(200);
    const after = balancesOf(CIF, readAccounts);
    expect(after[goalAccId]).toBe(before[goalAccId]);
    expect(after[mainId]).toBe(before[mainId] - 50);
    const credit = fx.db.prepare("SELECT 1 FROM transactions WHERE cif = ? AND id = ?").get(CIF, `${txn.id}-credit`);
    expect(credit).toBeUndefined();
  });

  it("nguồn là TK goal: chân trừ mang accountId goal; vượt số dư → 422", async () => {
    const out = baseTxn({
      id: "xfer-goal-out",
      accountId: goalAccId,
      counterpartyAccountNumber: "external-999",
      counterpartyBankName: "MSB",
      amount: 100,
    });
    const ok = await debit(out, 100, goalAccId);
    expect(ok.status).toBe(200);
    const row = fx.db.prepare("SELECT payload FROM transactions WHERE cif = ? AND id = ?").get(CIF, out.id) as {
      payload: string;
    };
    expect(JSON.parse(row.payload).accountId).toBe(goalAccId);

    const before = balancesOf(CIF, readAccounts);
    const over = baseTxn({
      id: "xfer-goal-over",
      accountId: goalAccId,
      amount: 1e12,
      counterpartyAccountNumber: "external-888",
    });
    expect((await debit(over, 1e12, goalAccId)).status).toBe(422);
    expect(balancesOf(CIF, readAccounts)).toEqual(before);
  });

  it("lỗi giữa chừng → rollback toàn bộ (F4)", async () => {
    const txn = baseTxn({ id: "xfer-partial", amount: 100 });
    const before = balancesOf(CIF, readAccounts);
    fx.db.exec("CREATE TRIGGER xfer_fail BEFORE INSERT ON gv2_txn_kinds BEGIN SELECT RAISE(ABORT, 'injected'); END");
    try {
      const result = await debit(txn);
      expect(result.status).toBeGreaterThanOrEqual(500);
      expect(balancesOf(CIF, readAccounts)).toEqual(before);
      const rows = fx.db.prepare("SELECT id FROM transactions WHERE cif = ? AND id LIKE ?").all(CIF, `${txn.id}%`);
      expect(rows).toHaveLength(0);
    } finally {
      fx.db.exec("DROP TRIGGER IF EXISTS xfer_fail");
    }
  });

  it("rollback khi lỗi ghi gv2_transfer_sources (internal)", async () => {
    const txn = baseTxn({ id: "xfer-src-fail", amount: 100 });
    const before = balancesOf(CIF, readAccounts);
    fx.db.exec(
      "CREATE TRIGGER xfer_src_fail BEFORE INSERT ON gv2_transfer_sources BEGIN SELECT RAISE(ABORT, 'src injected'); END",
    );
    try {
      const result = await debit(txn);
      expect(result.status).toBeGreaterThanOrEqual(500);
      expect(balancesOf(CIF, readAccounts)).toEqual(before);
      expect(fx.db.prepare("SELECT id FROM transactions WHERE cif = ? AND id LIKE ?").all(CIF, `${txn.id}%`)).toHaveLength(0);
      expect(fx.db.prepare("SELECT * FROM gv2_transfer_sources WHERE txn_id = ?").all(txn.id)).toHaveLength(0);
    } finally {
      fx.db.exec("DROP TRIGGER IF EXISTS xfer_src_fail");
    }
  });

  it("world vẫn đọc được sau các chuyển", () => {
    const { world } = getWorld(CIF);
    expect(world.accounts.some((a) => a.status === "open")).toBe(true);
  });
});
