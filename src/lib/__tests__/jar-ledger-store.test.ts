// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * `jar-ledger-store.ts` + the ledger/anchor side of `writeJarConfig`
 * (`jars-store.ts`) against an in-memory DB built from the real `data/schema.sql`:
 * validation, all-or-nothing appends, cif scoping, ordering, `created_at`
 * preservation across the DELETE+INSERT, and ledger cleanup of removed jars.
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import type { JarConfig } from "@/domain/models";
import { appendJarLedger, deleteLedgerExcept, readJarLedger, type NewJarLedgerEntry } from "../jar-ledger-store";
import { readJarConfig, writeJarConfig } from "../jars-store";

const SCHEMA = readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");
const A = "CIF_A";
const B = "CIF_B";
const T1 = "2026-09-10T08:00:00.000Z";
const T2 = "2026-09-12T08:00:00.000Z";

const entry = (id: string, jarId: string, over: Partial<NewJarLedgerEntry> = {}): NewJarLedgerEntry => ({
  id, jarId, kind: "deposit", amount: 100_000, isOpening: false, createdAt: T1, ...over,
});

const config = (...ids: string[]): JarConfig => ({
  version: 3,
  jars: ids.map((id) => ({ id, label: id, categoryIds: [] })),
});

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(SCHEMA);
});

describe("appendJarLedger / readJarLedger", () => {
  it("round-trips entries as self_reported, ordered by created_at then insertion, scoped by cif", () => {
    appendJarLedger(A, [entry("l2", "food", { createdAt: T2 }), entry("l1", "food", { kind: "withdraw", amount: 5 })]);
    appendJarLedger(A, [entry("l3", "fun", { createdAt: T2, isOpening: true, amount: 0 })]);
    appendJarLedger(B, [entry("l1", "food")]);
    expect(readJarLedger(A)).toEqual([
      { id: "l1", jarId: "food", kind: "withdraw", amount: 5, isOpening: false, createdAt: T1, source: "self_reported" },
      { id: "l2", jarId: "food", kind: "deposit", amount: 100_000, isOpening: false, createdAt: T2, source: "self_reported" },
      { id: "l3", jarId: "fun", kind: "deposit", amount: 0, isOpening: true, createdAt: T2, source: "self_reported" },
    ]);
    expect(readJarLedger(B).map((e) => e.id)).toEqual(["l1"]);
    expect(readJarLedger("CIF_NONE")).toEqual([]);
  });

  it.each<[string, Partial<NewJarLedgerEntry>]>([
    ["0 non-opening", { amount: 0 }],
    ["negative", { amount: -1 }],
    ["fractional", { amount: 1.5 }],
    ["NaN", { amount: Number.NaN }],
    ["unsafe", { amount: Number.MAX_SAFE_INTEGER + 1 }],
    ["opening withdraw", { kind: "withdraw", isOpening: true }],
    ["bad kind", { kind: "move" as NewJarLedgerEntry["kind"] }],
    ["bad createdAt", { createdAt: "not-a-date" }],
    ["empty jarId", { jarId: "" }],
  ])("rejects %s and writes nothing from the batch", (_label, over) => {
    expect(() => appendJarLedger(A, [entry("ok", "food"), entry("bad", "food", over)])).toThrow(RangeError);
    expect(readJarLedger(A)).toEqual([]);
  });

  it("a second opening row for the same jar fails and rolls the whole batch back", () => {
    appendJarLedger(A, [entry("o1", "food", { isOpening: true, amount: 0 })]);
    expect(() =>
      appendJarLedger(A, [entry("d1", "food"), entry("o2", "food", { isOpening: true, amount: 10 })]),
    ).toThrow(/UNIQUE/);
    expect(readJarLedger(A).map((e) => e.id)).toEqual(["o1"]);
  });

  it("deleteLedgerExcept keeps only the listed jars, for that cif only", () => {
    appendJarLedger(A, [entry("a1", "food"), entry("a2", "fun"), entry("a3", "save")]);
    appendJarLedger(B, [entry("b1", "fun")]);
    expect(deleteLedgerExcept(A, ["food", "save"])).toBe(1);
    expect(readJarLedger(A).map((e) => e.jarId)).toEqual(["food", "save"]);
    expect(readJarLedger(B)).toHaveLength(1);
    expect(deleteLedgerExcept(A, [])).toBe(2);
  });
});

describe("writeJarConfig — anchor + ledger", () => {
  it("stamps new jars with nowIso and preserves an existing jar's created_at across rewrites", () => {
    writeJarConfig(A, config("food"), T1);
    const out = writeJarConfig(A, { version: 3, jars: [{ id: "food", label: "x", categoryIds: [], createdAt: "1999-01-01T00:00:00.000Z" }, ...config("fun").jars] }, T2);
    const byId = new Map(out.jars.map((j) => [j.id, j.createdAt]));
    expect(byId.get("food")).toBe(T1); // client-sent createdAt ignored
    expect(byId.get("fun")).toBe(T2);
  });

  it("the 2-arg call defaults created_at to the demo transfer clock", () => {
    const out = writeJarConfig(A, config("food"));
    expect(out.jars.find((j) => j.id === "food")?.createdAt?.startsWith("2026-09-15T")).toBe(true);
  });

  it("drops the ledger of removed jars (a reused id starts clean) and attaches the ledger on read", () => {
    writeJarConfig(A, config("food", "fun"), T1);
    appendJarLedger(A, [entry("l1", "food"), entry("l2", "fun")]);
    expect(readJarConfig(A).ledger?.map((e) => e.id)).toEqual(["l1", "l2"]);

    const out = writeJarConfig(A, config("food"), T2);
    expect(out.ledger?.map((e) => e.jarId)).toEqual(["food"]);

    const reused = writeJarConfig(A, config("food", "fun"), T2);
    expect(reused.ledger?.map((e) => e.jarId)).toEqual(["food"]);
    expect(reused.jars.find((j) => j.id === "fun")?.createdAt).toBe(T2);
  });

  it("ignores an incoming ledger (read-only projection)", () => {
    writeJarConfig(A, { ...config("food"), ledger: [{ ...entry("fake", "food"), source: "self_reported" }] }, T1);
    expect(readJarConfig(A).ledger).toEqual([]);
  });
});
