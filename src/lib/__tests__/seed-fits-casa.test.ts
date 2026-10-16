// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { PERSONA_LIST } from "@/providers/mock/personas";

/**
 * C3 guard: the COMMITTED `data/pfm.sqlite3` (git-tracked, shipped to every
 * clone/CI/demo) must have Σ budgetLimit ≤ CASA for every persona. CASA is
 * derived from `personas.ts` (salaryBase, no hard-coded scale) exactly as the
 * server's `casa-pool.ts` does — 18tr × salaryBase/25tr. If this fails, run
 * `npm run db:seed` and commit the updated sqlite.
 */

const DB_PATH = path.join(process.cwd(), "data", "pfm.sqlite3");
const CASA_BASE = 18_000_000;
const SALARY_REF = 25_000_000;

describe("seeded jars fit CASA (committed sqlite)", () => {
  it("Σ budgetLimit ≤ CASA for every persona", () => {
    expect(existsSync(DB_PATH)).toBe(true);
    const db = new Database(DB_PATH, { readonly: true });
    try {
      for (const persona of PERSONA_LIST) {
        const row = db
          .prepare("SELECT COALESCE(SUM(budget_limit), 0) AS sum, COUNT(*) AS n FROM jars WHERE cif = ?")
          .get(persona.cif) as { sum: number; n: number };
        expect(row.n).toBeGreaterThan(0); // persona is actually seeded
        const casa = Math.round(CASA_BASE * (persona.params.salaryBase / SALARY_REF));
        expect(row.sum).toBeLessThanOrEqual(casa);
        expect(row.sum).toBeGreaterThan(0); // and not empty — real numbers on open
      }
    } finally {
      db.close();
    }
  });
});
