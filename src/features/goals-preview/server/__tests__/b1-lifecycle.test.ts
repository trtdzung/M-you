// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { Transaction } from "@/domain/models";
import { CIF, goalInput, openGoalFixtureDb, totalMoney, type GoalFixture } from "./helpers/goal-test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db! }));

import { aggregateCashflow, monthPeriod } from "@/domain/engine";
import { casaBalance } from "@/domain/engine/casa-balance";
import { casaPool } from "@/domain/engine/jar-envelope";
import { readAccounts } from "@/lib/accounts-store";
import { readTransactions } from "@/lib/transactions-store";
import { transferToOwnGoalAccount } from "../incoming";
import { applyAction, getWorld } from "../goal-service";

process.env.AGENT_MODE = "mock";

/** Tổng tiền trên sổ tài khoản + gốc tài sản mục tiêu (sau invest). */
function wealth(cif: string, world: { assets: { principal?: number; value: number; status: string }[] }) {
  const accounts = totalMoney(cif, readAccounts);
  const assets = world.assets
    .filter((a) => a.status !== "sold")
    .reduce((s, a) => s + (a.principal ?? a.value), 0);
  return accounts + assets;
}

describe("Chuỗi B1 lifecycle + bảo toàn tiền", () => {
  let fx: GoalFixture;

  beforeAll(async () => {
    fx = await openGoalFixtureDb();
    holder.db = fx.db;
  });

  afterAll(() => fx.close());

  it("tạo → mở/nạp → trích → tua ≥ 3 tháng → gửi tiết kiệm → rút → chuyển Chuyển tiền → đóng", () => {
    let world = getWorld(CIF).world;
    const cashOf = () => {
      const [y, m] = world.clock.today.split("-").map(Number);
      return aggregateCashflow(readTransactions(CIF), monthPeriod(y, m - 1), new Set());
    };

    const act = (id: string, action: unknown) => {
      const r = applyAction(CIF, id, action);
      expect(r.ok, id + ("error" in r ? `: ${r.error}` : "")).toBe(true);
      if (r.ok) world = r.world;
      return r;
    };

    const w0 = wealth(CIF, world);
    const baselineCasa = casaBalance(readAccounts(CIF));
    const baselinePool = Number(casaPool(readAccounts(CIF)).amount);

    act("b1-create", { type: "createGoal", input: { ...goalInput("B1 goal"), initialDeposit: 2_000_000 } });
    const g = world.goals.at(-1)!.id;
    expect(wealth(CIF, world)).toBe(w0);
    expect(casaBalance(readAccounts(CIF))).toBe(baselineCasa - 2_000_000);
    expect(Number(casaPool(readAccounts(CIF)).amount)).toBe(baselinePool - 2_000_000);

    act("b1-deposit", { type: "deposit", goalId: g, amount: 1_000_000 });
    expect(wealth(CIF, world)).toBe(w0);

    const beforeDup = (
      fx.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ?").get(CIF) as { n: number }
    ).n;
    act("b1-deposit", { type: "deposit", goalId: g, amount: 1_000_000 });
    expect(
      (fx.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE cif = ?").get(CIF) as { n: number }).n,
    ).toBe(beforeDup);

    const insufficient = applyAction(CIF, "b1-insufficient", { type: "deposit", goalId: g, amount: 1e15 });
    expect(insufficient.ok).toBe(false);
    expect(wealth(CIF, world)).toBe(w0);

    act("b1-standing", { type: "setStandingOrder", goalId: g, amount: 100_000, dayOfMonth: 5 });
    const todayBefore = world.clock.today;
    act("b1-advance", { type: "advanceTime", days: 100 });
    expect(world.clock.today > todayBefore).toBe(true);
    // Sau tua có thể có lương mô phỏng → wealth có thể tăng; ghi nhận số cụ thể.
    const afterAdvance = wealth(CIF, world);
    expect(afterAdvance).toBeGreaterThanOrEqual(w0);

    const beforeInvest = wealth(CIF, world);
    act("b1-invest", {
      type: "invest",
      goalId: g,
      productId: "msb-online-deposit",
      amount: 1_000_000,
      termMonths: 3,
    });
    expect(wealth(CIF, world)).toBe(beforeInvest);

    const beforeWithdraw = wealth(CIF, world);
    act("b1-withdraw", { type: "withdraw", goalId: g, amount: 100_000 });
    expect(wealth(CIF, world)).toBe(beforeWithdraw);

    const main = readAccounts(CIF).find((a) => a.type === "current")!;
    const ga = readAccounts(CIF).find((a) => a.id === world.goals.find((x) => x.id === g)?.accountId)!;
    const cashBefore = cashOf();
    const beforeIncoming = wealth(CIF, world);
    const t = {
      id: "b1-incoming",
      accountId: main.id,
      postedAt: `${world.clock.today}T05:00:00.000Z`,
      amount: 123_456,
      currency: "VND" as const,
      direction: "debit" as const,
      type: "transfer" as const,
      categoryId: "transfer",
      merchantName: "B1",
      merchantNormalizedName: "b1",
      status: "posted" as const,
      source: "self_reported" as const,
      isRecurring: false,
      userEdited: false,
      counterpartyAccountNumber: ga.accountNumber,
      counterpartyBankName: "MSB",
    } satisfies Transaction;
    transferToOwnGoalAccount(CIF, main.id, t.amount, t);
    transferToOwnGoalAccount(CIF, main.id, t.amount, t);
    world = getWorld(CIF).world;
    expect(wealth(CIF, world)).toBe(beforeIncoming);
    const cashAfter = cashOf();
    expect(cashAfter.income).toBe(cashBefore.income);
    expect(cashAfter.expense).toBe(cashBefore.expense);

    const casa0 = casaBalance(readAccounts(CIF));
    const pool0 = Number(casaPool(readAccounts(CIF)).amount);
    fx.db
      .prepare(
        "UPDATE accounts SET balance = balance + 999999, available_balance = available_balance + 999999 WHERE cif = ? AND id = ?",
      )
      .run(CIF, ga.id);
    expect(casaBalance(readAccounts(CIF))).toBe(casa0);
    expect(Number(casaPool(readAccounts(CIF)).amount)).toBe(pool0);
    fx.db
      .prepare(
        "UPDATE accounts SET balance = balance - 999999, available_balance = available_balance - 999999 WHERE cif = ? AND id = ?",
      )
      .run(CIF, ga.id);

    const beforeClose = wealth(CIF, world);
    const goalCash = world.accounts.find((a) => a.id === ga.id)!.balance;
    const mainBefore = world.customer.mainCasaBalance;
    expect(goalCash).toBeGreaterThan(0);
    act("b1-close", { type: "closeGoal", goalId: g });
    // Đóng rút tiền về CASA; tài sản còn lại (nếu có) vẫn trong world tới khi bán — closeGoal rút cash.
    world = getWorld(CIF).world;
    // Đóng mục tiêu: toàn bộ tiền mặt (cả khoản đầu tư MSB vừa tất toán) về tài khoản chính, không mất đồng nào.
    const closed = world.goals.find((x) => x.id === g)!;
    expect(world.customer.mainCasaBalance - mainBefore).toBeGreaterThanOrEqual(goalCash);
    expect(world.customer.mainCasaBalance - mainBefore).toBe(closed.finalValue);
    expect(readAccounts(CIF).some((a) => a.id === ga.id)).toBe(false);
    expect(wealth(CIF, world)).toBe(beforeClose);

    const forged = structuredClone(world);
    forged.customer.mainCasaBalance += 7_777_777;
    expect(applyAction(CIF, "b1-forged", { type: "world/sync", world: forged }).ok).toBe(false);
  });
});
