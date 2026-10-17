import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JAR_TEMPLATES } from "../jar-defaults";

/**
 * Test #21 — `data/seed-jars.json` (what `scripts/seed-db.mjs` writes into the
 * `jars` table) and `JAR_TEMPLATES.caNhan.jars` (what the app applies when a user
 * picks the "Cá nhân" template) must be the SAME six jars.
 *
 * They used to be two hand-maintained literals. Drift between them is invisible
 * until it shows up as money: a seeded jar with a different `budgetLimit` or a
 * category in a different hũ reports different `spent`/`balance` than the same
 * template re-applied later, and nothing in the app would flag it. The script is
 * plain `.mjs` (no TS loader) so it cannot import the template directly — the
 * JSON file is the shared copy, and this test is the seam that keeps them equal.
 */
const SEED_JARS_PATH = path.join(process.cwd(), "data", "seed-jars.json");

describe("data/seed-jars.json ↔ JAR_TEMPLATES.caNhan", () => {
  it("is exactly the 'Cá nhân' template, jar for jar", () => {
    const seeded = JSON.parse(readFileSync(SEED_JARS_PATH, "utf8"));
    expect(seeded).toEqual(JAR_TEMPLATES.caNhan.jars);
  });

  it("keeps a limit-less jar limit-LESS (never 0) so the seeder writes NULL", () => {
    const seeded = JSON.parse(readFileSync(SEED_JARS_PATH, "utf8")) as { id: string; budgetLimit?: number }[];
    const savings = seeded.find((j) => j.id === "savings");
    expect(savings).toBeDefined();
    // JSON has no `undefined`: the key must be ABSENT, not `0` — the seeder maps
    // "no limit" to a NULL column, and 0 would read back as "hạn mức 0đ",
    // i.e. permanently over budget (invariant #6: missing ≠ zero).
    expect(savings).not.toHaveProperty("budgetLimit");
  });
});
