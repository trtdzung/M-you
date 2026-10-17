// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
const holder = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));
import { readFinancialProfile, syncFinancialProfile } from "../proactive-profile-store";

function open() {
  holder.db = new Database(":memory:");
  holder.db.exec(readFileSync("data/schema.sql", "utf8"));
}
afterEach(() => { holder.db?.close(); holder.db = null; });

describe("DB-backed self-reported profile sync", () => {
  it("merges server-owned fixtures, scopes token by CIF and rejects stale tokens", () => {
    open();
    const token = syncFinancialProfile("CIF_0001", [], []);
    expect(typeof token).toBe("string");
    expect(readFinancialProfile("CIF_0001", token)?.liabilities).toHaveLength(1);
    expect(readFinancialProfile("CIF_0001", token)?.goals).toHaveLength(1);
    expect(readFinancialProfile("CIF_0002", token)).toBeNull();
    const next = syncFinancialProfile("CIF_0001", [], []);
    expect(readFinancialProfile("CIF_0001", token)).toBeNull();
    expect(readFinancialProfile("CIF_0001", next)).not.toBeNull();
  });

  it("does not accept forged bank provenance, duplicate IDs, or invalid amounts", () => {
    open();
    const liability = { id: "user-one", type: "personal_loan", name: "Vay", outstandingPrincipal: 1_000_000,
      interestRate: 0.1, minimumPayment: 100_000, dueDate: "2026-10-20", remainingTerm: 10,
      source: "self_reported", lastUpdatedAt: "2026-09-15T00:00:00.000Z" };
    expect(syncFinancialProfile("CIF_0001", [{ ...liability, source: "msb" }], [])).toBeNull();
    expect(syncFinancialProfile("CIF_0001", [liability, liability], [])).toBeNull();
    expect(syncFinancialProfile("CIF_0001", [{ ...liability, outstandingPrincipal: -1 }], [])).toBeNull();
    expect(syncFinancialProfile("CIF_0001", [liability], [])).not.toBeNull();
  });
});
