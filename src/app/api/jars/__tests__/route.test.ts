// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Jar, JarConfig } from "@/domain/models";

/**
 * Route-level integration for the two cap-enforcing write doors — batch
 * `PATCH /api/jars` and single `PATCH /api/jars/:id`. The other suites cover
 * `fitsCasaCap` and the seeded-DB invariant in isolation (unit + committed
 * -sqlite); this exercises the ACTUAL handlers end-to-end so the wiring the red
 * team cared about (C2 — server derives CASA itself and rejects an over-cap
 * write; 404-vs-422 status; `categoryIds` dropped from a batch) is load-bearing,
 * not just inspected. A jar has NO stored balance — the Σ budgetLimit ≤ CASA cap
 * is the only ceiling (spendable is derived, bounded by budgetLimit).
 *
 * `@/lib/db` is mocked to an in-memory SQLite so the real `jars-store` runs for
 * real; `server-only` is neutralised (it throws outside a Server Component).
 * CIF_0001's CASA pool is 18tr (salaryBase 25tr → 18tr × 25/25).
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import { GET, PATCH } from "../route";
import { PATCH as patchJar } from "../[id]/route";
import { writeJarConfig } from "@/lib/jars-store";

const CIF = "CIF_0001";
const CASA = 18_000_000;

const JARS_DDL = `CREATE TABLE jars (
  id TEXT NOT NULL, cif TEXT NOT NULL, label TEXT NOT NULL, category_ids TEXT NOT NULL,
  budget_limit REAL, color TEXT, icon TEXT, sort_order INTEGER NOT NULL, role TEXT,
  PRIMARY KEY (cif, id)
);`;

// CASA is DB-backed now: `casaPoolForCif` reads the `accounts` table (lazily
// seeding CIF_0001's 18tr `current` account on first read → CASA stays 18tr,
// the value this suite asserts against). The handlers need the table to exist.
const ACCOUNTS_DDL = `CREATE TABLE accounts (
  cif TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, institution TEXT NOT NULL,
  currency TEXT NOT NULL, balance REAL NOT NULL, available_balance REAL NOT NULL,
  last_synced_at TEXT NOT NULL, source TEXT NOT NULL, tier TEXT,
  masked_number TEXT NOT NULL, account_number TEXT NOT NULL, sort_order INTEGER NOT NULL,
  PRIMARY KEY (cif, id)
);`;

/** Seed a controlled jar set (bypasses the cap on purpose — writeJarConfig never caps). */
function seed(jars: Jar[]): void {
  writeJarConfig(CIF, { version: 3, jars });
}

function batchPatch(patches: Record<string, unknown>, cif: string | null = CIF): Promise<Response> {
  const url = cif ? `http://localhost/api/jars?cif=${cif}` : "http://localhost/api/jars";
  return PATCH(new NextRequest(url, { method: "PATCH", body: JSON.stringify({ patches }) }));
}

function singlePatch(id: string, patch: unknown, cif: string | null = CIF): [NextRequest, { params: Promise<{ id: string }> }] {
  const url = cif ? `http://localhost/api/jars/${id}?cif=${cif}` : `http://localhost/api/jars/${id}`;
  const req = new NextRequest(url, { method: "PATCH", body: JSON.stringify({ patch }) });
  return [req, { params: Promise.resolve({ id }) }];
}

async function readConfig(): Promise<JarConfig> {
  const res = await GET(new NextRequest(`http://localhost/api/jars?cif=${CIF}`));
  return res.json();
}

function findJar(config: JarConfig, id: string): Jar | undefined {
  return config.jars.find((j) => j.id === id);
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(JARS_DDL);
  holder.db.exec(ACCOUNTS_DDL);
});

describe("PATCH /api/jars (batch cap door)", () => {
  it("422s when cif is missing", async () => {
    const res = await batchPatch({ a: { budgetLimit: 1 } }, null);
    expect(res.status).toBe(422);
  });

  it("422s when patches is not an object", async () => {
    const req = new NextRequest(`http://localhost/api/jars?cif=${CIF}`, {
      method: "PATCH",
      body: JSON.stringify({ patches: ["nope"] }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(422);
  });

  it("404s when a patched jar id does not exist", async () => {
    seed([{ id: "a", label: "A", categoryIds: [] }]);
    const res = await batchPatch({ ghost: { budgetLimit: 1_000_000 } });
    expect(res.status).toBe(404);
  });

  it("rejects an over-cap batch with 422 + overBy and leaves the store unchanged", async () => {
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 5_000_000 },
    ]);
    const res = await batchPatch({ a: { budgetLimit: 10_000_000 }, b: { budgetLimit: 10_000_000 } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.overBy).toBe(20_000_000 - CASA); // 2tr over
    // Store untouched — the atomic write never ran.
    const after = await readConfig();
    expect(findJar(after, "a")?.budgetLimit).toBe(5_000_000);
    expect(findJar(after, "b")?.budgetLimit).toBe(5_000_000);
  });

  it("accepts a within-cap batch and persists every new limit", async () => {
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 5_000_000 },
    ]);
    const res = await batchPatch({ a: { budgetLimit: 8_000_000 }, b: { budgetLimit: 8_000_000 } });
    expect(res.status).toBe(200);
    const config: JarConfig = await res.json();
    expect(findJar(config, "a")?.budgetLimit).toBe(8_000_000);
    expect(findJar(config, "b")?.budgetLimit).toBe(8_000_000);
  });

  it("rejects a negative budgetLimit patch as invalid (422) rather than silently swallowing it (RT#6)", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const res = await batchPatch({ a: { budgetLimit: -1 } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("patch for a is invalid");
    // Store untouched.
    const after = await readConfig();
    expect(findJar(after, "a")?.budgetLimit).toBe(5_000_000);
  });
});

describe("PATCH /api/jars/:id (single cap door)", () => {
  it("rejects a per-jar budgetLimit set that pushes Σ over CASA (422 + overBy)", async () => {
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 5_000_000 },
    ]);
    const [req, ctx] = singlePatch("a", { budgetLimit: 15_000_000 });
    const res = await patchJar(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.overBy).toBe(20_000_000 - CASA);
  });

  it("clears a limit (null) even when the stored config is already over cap — no cap check", async () => {
    // Legacy over-cap set, written directly (writeJarConfig never caps).
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 15_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 10_000_000 },
    ]);
    const [req, ctx] = singlePatch("a", { budgetLimit: null });
    const res = await patchJar(req, ctx);
    expect(res.status).toBe(200);
    const config: JarConfig = await res.json();
    expect(findJar(config, "a")?.budgetLimit).toBeUndefined();
  });
});
