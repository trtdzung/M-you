// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Jar, JarConfig } from "@/domain/models";

/**
 * `POST /api/jar-ledger` (plan 260923, phase 03): the one atomic door for jar
 * deposits/withdrawals. Real handler + real stores + real engine over an
 * in-memory SQLite. CIF_0001's CASA is pinned to 18tr; the test jars own no
 * categories, so a jar's balance is exactly Σ deposit − Σ withdraw.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { POST } from "../route";
import { GET as jarSummary } from "../../jar-summary/route";
import { jarBalances } from "@/domain/engine";
import { txn } from "@/domain/engine/__tests__/helpers";
import { MAX_JAR_AMOUNT } from "@/domain/jar-rules";
import { casaPoolForCif } from "@/lib/casa-pool";
import { transferNow } from "@/lib/demo-clock";
import { appendJarLedger } from "@/lib/jar-ledger-store";
import { readJarConfig, writeJarConfig } from "@/lib/jars-store";
import { ACCOUNTS_DDL, JARS_DDL, TRANSACTIONS_DDL } from "../../jars/__tests__/jar-route-test-ddl";

const CIF = "CIF_0001";
const ANCHOR = "2026-09-01T00:00:00.000Z";
const CORRECTIONS_DDL = `CREATE TABLE transaction_corrections (
  cif TEXT NOT NULL, txn_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (cif, txn_id)
);`;

type Entry = { jarId: string; kind: string; amount: unknown };

const post = (entries: unknown, cif: unknown = CIF) =>
  POST(new NextRequest("http://localhost/api/jar-ledger", { method: "POST", body: JSON.stringify({ cif, entries }) }));
const dep = (jarId: string, amount: number): Entry => ({ jarId, kind: "deposit", amount });
const wd = (jarId: string, amount: number): Entry => ({ jarId, kind: "withdraw", amount });
const ledgerCount = () =>
  (holder.db!.prepare("SELECT COUNT(*) AS n FROM jar_ledger WHERE cif = ?").get(CIF) as { n: number }).n;

/** Balance of `id` in a config, on the same clock the routes use. */
const balanceOf = (config: JarConfig, id: string) =>
  jarBalances(config, [], transferNow().toISOString()).get(id)?.balance;

/** Seed jars anchored at ANCHOR; `openings` maps jar id → opening deposit (absent = unfunded). */
function seed(openings: Record<string, number>, extra: Jar[] = []): void {
  const jars = [...Object.keys(openings).map((id) => ({ id, label: id, categoryIds: [] })), ...extra];
  writeJarConfig(CIF, { version: 3, jars }, ANCHOR);
  appendJarLedger(
    CIF,
    Object.entries(openings).map(([jarId, amount]) => ({
      id: `open-${jarId}`, jarId, kind: "deposit" as const, amount, isOpening: true, createdAt: ANCHOR,
    })),
  );
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(JARS_DDL);
  holder.db.exec(ACCOUNTS_DDL);
  holder.db.exec(TRANSACTIONS_DDL);
  holder.db.exec(CORRECTIONS_DDL);
  casaPoolForCif(CIF);
  holder.db.prepare("UPDATE accounts SET available_balance = ? WHERE cif = ? AND type = 'current'").run(18_000_000, CIF);
});

afterEach(() => vi.useRealTimers());

describe("POST /api/jar-ledger — valid writes", () => {
  it("a 1-entry deposit → 201 with the full JarConfig", async () => {
    seed({ a: 5_000_000 });
    const res = await post([dep("a", 1_000_000)]);
    expect(res.status).toBe(201);
    const config: JarConfig = await res.json();
    expect(config.version).toBe(3);
    expect(balanceOf(config, "a")).toBe(6_000_000);
    const row = config.ledger!.find((e) => !e.isOpening)!;
    expect(row).toMatchObject({ jarId: "a", kind: "deposit", amount: 1_000_000, source: "self_reported" });
  });

  it("a multi-entry batch applies every entry", async () => {
    seed({ a: 1_000_000, b: 1_000_000 });
    const res = await post([dep("a", 2_000_000), dep("b", 3_000_000), wd("a", 500_000)]);
    expect(res.status).toBe(201);
    const config: JarConfig = await res.json();
    expect(balanceOf(config, "a")).toBe(2_500_000);
    expect(balanceOf(config, "b")).toBe(4_000_000);
    expect(ledgerCount()).toBe(5);
  });

  it("withdraw A + deposit B passes on a full cap (the net is checked once)", async () => {
    seed({ a: 10_000_000, b: 8_000_000 }); // Σ 18tr = CASA
    expect((await post([dep("b", 2_000_000)])).status).toBe(422); // alone it would exceed
    const res = await post([wd("a", 2_000_000), dep("b", 2_000_000)]);
    expect(res.status).toBe(201);
    const config: JarConfig = await res.json();
    expect(balanceOf(config, "a")).toBe(8_000_000);
    expect(balanceOf(config, "b")).toBe(10_000_000);
  });

  it("a deposit earlier in the batch funds a later withdraw on an unfunded jar", async () => {
    seed({}, [{ id: "c", label: "C", categoryIds: [] }]);
    const res = await post([dep("c", 1_000_000), wd("c", 400_000)]);
    expect(res.status).toBe(201);
    expect(balanceOf(await res.json(), "c")).toBe(600_000);
  });

  it("a deposit at a non-midnight time-of-day is visible at once (Red Team #1)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-03-04T15:30:12.345Z")); // transferNow → 2026-09-15T15:30:12.345Z
    seed({ a: 5_000_000 });
    const res = await post([dep("a", 1_234_000)]);
    expect(res.status).toBe(201);
    const config: JarConfig = await res.json();
    expect(config.ledger!.find((e) => !e.isOpening)!.createdAt).toBe("2026-09-15T15:30:12.345Z");
    expect(balanceOf(config, "a")).toBe(6_234_000);

    const summary = await (await jarSummary(new NextRequest(`http://localhost/api/jar-summary?cif=${CIF}`))).json();
    const line = summary.jars.find((j: { id: string }) => j.id === "a");
    expect(line.balance).toBe(6_234_000);
    expect(line.remaining).toBe(6_234_000); // deprecated alias
    expect(line.spendable).toBe(6_234_000);
  });
});

describe("POST /api/jar-ledger — judges the balance the screen shows (corrections + hidden)", () => {
  function seedFoodWithSpend(): void {
    seed({}, [{ id: "food", label: "Ăn uống", categoryIds: ["dining"] }]);
    appendJarLedger(CIF, [
      { id: "open-food", jarId: "food", kind: "deposit", amount: 5_000_000, isOpening: true, createdAt: ANCHOR },
    ]);
    const t = txn({ id: "bank-1", categoryId: "dining", amount: 3_000_000, postedAt: "2026-09-10T03:00:00.000Z" });
    holder.db!
      .prepare("INSERT INTO transactions (cif, id, source, posted_at, payload) VALUES (?, ?, 'mock', ?, ?)")
      .run(CIF, t.id, t.postedAt, JSON.stringify(t));
  }
  const correct = (payload: Record<string, unknown>) =>
    holder.db!
      .prepare("INSERT INTO transaction_corrections (cif, txn_id, payload, updated_at) VALUES (?, ?, ?, ?)")
      .run(CIF, "bank-1", JSON.stringify({ origin: "user", ...payload }), ANCHOR);

  it("without a correction the 3tr spend counts → withdrawing 4tr of a 2tr balance is refused", async () => {
    seedFoodWithSpend();
    const res = await post([wd("food", 4_000_000)]);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "over balance", jarId: "food", maxWithdraw: 2_000_000 });
  });

  it("a recategorized spend leaves the jar → the full 5tr balance is withdrawable", async () => {
    seedFoodWithSpend();
    correct({ categoryId: "shopping" });
    expect((await post([wd("food", 4_000_000)])).status).toBe(201);
  });

  it("a hidden spend no longer counts → the full 5tr balance is withdrawable", async () => {
    seedFoodWithSpend();
    correct({ hidden: true });
    expect((await post([wd("food", 5_000_000)])).status).toBe(201);
  });
});

describe("POST /api/jar-ledger — rejections (nothing is written)", () => {
  it("one bad withdraw rolls back the whole batch", async () => {
    seed({ a: 1_000_000, b: 2_000_000 });
    const before = ledgerCount();
    const res = await post([dep("a", 1_000_000), wd("b", 2_000_001)]);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "over balance", jarId: "b", maxWithdraw: 2_000_000 });
    expect(ledgerCount()).toBe(before);
    expect(balanceOf(readJarConfig(CIF), "a")).toBe(1_000_000);
  });

  it("a withdraw on an unfunded (null) jar → 422 with maxWithdraw null", async () => {
    seed({ a: 1_000_000 }, [{ id: "c", label: "C", categoryIds: [] }]);
    const res = await post([wd("c", 1)]);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "over balance", jarId: "c", maxWithdraw: null });
  });

  it("a batch raising Σ spendable past CASA → 422 + overBy", async () => {
    seed({ a: 10_000_000 });
    const res = await post([dep("a", 5_000_000), dep("a", 4_000_000)]);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "over CASA cap", overBy: 1_000_000 });
    expect(ledgerCount()).toBe(1);
  });

  it("an unknown jar → 404 with its jarId", async () => {
    seed({ a: 1_000_000 });
    const res = await post([dep("a", 1), dep("ghost", 1)]);
    expect(res.status).toBe(404);
    expect((await res.json()).jarId).toBe("ghost");
    expect(ledgerCount()).toBe(1);
  });

  it("the synthetic healed 'Khác' (no DB row) → 422 jar not persisted (Red Team #5)", async () => {
    seed({ a: 1_000_000 });
    expect(readJarConfig(CIF).jars.map((j) => j.id)).toContain("khac"); // healed in, not stored
    const res = await post([dep("khac", 1_000)]);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "jar not persisted", jarId: "khac" });
    expect(ledgerCount()).toBe(1);
  });

  it("422s without a cif", async () => {
    seed({ a: 1_000_000 });
    expect((await post([dep("a", 1)], "")).status).toBe(422);
  });

  const half = MAX_JAR_AMOUNT / 2;
  it.each<[string, unknown]>([
    ["missing entries", undefined],
    ["an empty batch", []],
    ["more than 50 entries", Array.from({ length: 51 }, () => dep("a", 1))],
    ["a bad kind", [{ jarId: "a", kind: "move", amount: 1 }]],
    ["a missing jarId", [{ kind: "deposit", amount: 1 }]],
    ["amount 0", [dep("a", 0)]],
    ["a negative amount", [dep("a", -1)]],
    ["a fractional amount", [dep("a", 1.5)]],
    ["a string amount", [{ jarId: "a", kind: "deposit", amount: "100" }]],
    ["an entry above 10^12", [dep("a", MAX_JAR_AMOUNT + 1)]],
    ["a total above 10^12", [dep("a", half), wd("a", half + 1)]],
  ])("rejects %s with 422 (Red Team #12)", async (_label, entries) => {
    seed({ a: 1_000_000 });
    const res = await post(entries);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("entries is invalid");
    expect(ledgerCount()).toBe(1);
  });

  it("accepts exactly 50 entries", async () => {
    seed({ a: 0 });
    expect((await post(Array.from({ length: 50 }, () => dep("a", 1)))).status).toBe(201);
    expect(ledgerCount()).toBe(51);
  });
});
