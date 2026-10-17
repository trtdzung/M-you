// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import type { Jar, JarConfig } from "@/domain/models";

/**
 * Route-level integration for the per-jar limit door `PATCH /api/jars/:id` (the
 * batch `PATCH /api/jars` is gone — plan 260923, Red Team #10). The other suites cover
 * `fitsCasaCap` and the seeded-DB invariant in isolation (unit + committed
 * -sqlite); this exercises the ACTUAL handlers end-to-end. A limit is a monthly
 * PLAN, not money: it is bounded by 10^12 VND but never by CASA — the CASA cap
 * reads Σ max(0, balance), which only ledger writes and category moves change.
 *
 * `@/lib/db` is mocked to an in-memory SQLite so the real `jars-store` runs for
 * real; `server-only` is neutralised (it throws outside a Server Component).
 * CIF_0001's CASA pool is 21.6tr (salaryBase 30tr → 18tr × 30/25).
 */

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: null as InstanceType<typeof import("better-sqlite3")> | null }));
vi.mock("@/lib/db", () => ({ getDb: () => holder.db }));

import * as collectionRoute from "../route";
import { PATCH as patchJar } from "../[id]/route";
import { writeJarConfig } from "@/lib/jars-store";
import { ACCOUNTS_DDL, CORRECTIONS_DDL, JARS_DDL, TRANSACTIONS_DDL } from "./jar-route-test-ddl";

const CIF = "CIF_0001";
const CASA = 21_600_000;

/** Seed a controlled jar set (bypasses the cap on purpose — writeJarConfig never caps). */
function seed(jars: Jar[]): void {
  writeJarConfig(CIF, { version: 3, jars });
}

function singlePatch(id: string, patch: unknown, cif: string | null = CIF): [NextRequest, { params: Promise<{ id: string }> }] {
  const url = cif ? `http://localhost/api/jars/${id}?cif=${cif}` : `http://localhost/api/jars/${id}`;
  const req = new NextRequest(url, { method: "PATCH", body: JSON.stringify({ patch }) });
  return [req, { params: Promise.resolve({ id }) }];
}

async function readConfig(): Promise<JarConfig> {
  const res = await collectionRoute.GET(new NextRequest(`http://localhost/api/jars?cif=${CIF}`));
  return res.json();
}

function findJar(config: JarConfig, id: string): Jar | undefined {
  return config.jars.find((j) => j.id === id);
}

beforeEach(() => {
  holder.db = new Database(":memory:");
  holder.db.exec(JARS_DDL);
  holder.db.exec(ACCOUNTS_DDL);
  holder.db.exec(TRANSACTIONS_DDL);
  holder.db.exec(CORRECTIONS_DDL);
});

describe("PATCH /api/jars (batch) — removed (Red Team #10)", () => {
  it("exports no PATCH handler, so Next answers 405", () => {
    expect((collectionRoute as Record<string, unknown>).PATCH).toBeUndefined();
    expect(Object.keys(collectionRoute).sort()).toEqual(["GET", "POST", "PUT"]);
  });
});

describe("PATCH /api/jars/:id (single cap door)", () => {
  it("a per-jar LIMIT raise past CASA passes — a limit is a monthly plan, not money (plan 260923)", async () => {
    seed([
      { id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 },
      { id: "b", label: "B", categoryIds: [], budgetLimit: 5_000_000 },
    ]);
    const [req, ctx] = singlePatch("a", { budgetLimit: 19_000_000 });
    const res = await patchJar(req, ctx);
    expect(res.status).toBe(200); // Σ limits 24tr > CASA ${CASA}, yet no balance moved
    expect(findJar(await res.json(), "a")?.budgetLimit).toBe(19_000_000);
  });

  it("rejects a limit above 10^12 VND (Red Team #12)", async () => {
    seed([{ id: "a", label: "A", categoryIds: [], budgetLimit: 5_000_000 }]);
    const [req, ctx] = singlePatch("a", { budgetLimit: 1_000_000_000_001 });
    expect((await patchJar(req, ctx)).status).toBe(422);
    const [req2, ctx2] = singlePatch("a", { budgetLimit: 1_000_000_000_000 });
    expect((await patchJar(req2, ctx2)).status).toBe(200);
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
