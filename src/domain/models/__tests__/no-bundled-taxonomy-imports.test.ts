import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Test #20 — the bundled taxonomy is a SEED, not the taxonomy.
 *
 * `CATEGORIES` / `CATEGORY_BY_ID` / `FIXED_CATEGORY_IDS` describe the ten preset
 * categories every persona STARTS from. Since the taxonomy became per-persona and
 * writable, reading them anywhere else is a bug with a money-shaped symptom: a
 * category the user created is absent (so their labelled spend reads as "chưa
 * phân loại"), and one they archived is still offered. The compiler cannot catch
 * it — both are just string lookups that succeed — so this scan is the guard.
 *
 * A file that genuinely needs the seed must be listed below WITH its reason. The
 * allow-list is not a place to park a new consumer: if a UI or engine file shows
 * up here, thread the persona's stored set through instead (`useCategories()` on
 * the client, `readCategories(cif)` on the server).
 */
const BUNDLED = ["CATEGORIES", "CATEGORY_BY_ID", "FIXED_CATEGORY_IDS"] as const;

const ALLOWED: Record<string, string> = {
  // — the four the plan allow-lists —
  "src/domain/models/categories.ts": "defines them",
  "src/domain/models/index.ts": "the barrel that re-exports them (not a consumer)",
  "src/lib/categories-store.ts": "seeds a new persona's rows from the presets",
  "src/domain/models/jar-defaults.ts":
    "jar TEMPLATES are authored against the preset ids, and owns BUILT_IN_EXPENSE_IDS",
  // — genuine additions, each with the reason it cannot take a stored set —
  "src/lib/category-colors.ts":
    "EXPENSE_ORDER is a FROZEN palette contract: a preset must keep its colour forever, so it is indexed by the bundled order, never by a per-persona list",
  "src/domain/models/category-rules.ts":
    "RESERVED_CATEGORY_IDS — a preset id is permanently reserved for EVERY persona, including ones whose stored set no longer contains it",
  "src/lib/agent-api.ts":
    "client-side (cannot import the server-only store); the presets are only the FALLBACK of the optional `expenseIds` whitelist, which callers now inject — it never widens the whitelist",
  "src/lib/category-txn-type.ts":
    "same: optional `byId`, presets as fallback only; callers pass useCategories().byId",
  "src/state/category-memory.tsx":
    "same: optional `assignable`, presets as fallback only; the provider injects the stored set",
};

/** Mock BANK data deliberately stays on the presets (fixtures are not a persona). */
const ALLOWED_PREFIXES = ["src/providers/mock/fixtures/"];

/** Source files only — tests and test doubles may seed from the presets freely. */
function isScannable(rel: string): boolean {
  if (!/\.tsx?$/.test(rel)) return false;
  if (rel.includes("__tests__/")) return false;
  if (/\.(test|spec)\.tsx?$/.test(rel)) return false;
  return !rel.startsWith("src/test-utils/");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** The named bindings of every `import`/`export … from` statement in `source`. */
function importedNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
  for (const match of source.matchAll(re)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

describe("no bundled-taxonomy imports outside the allow-list", () => {
  const root = path.join(process.cwd(), "src");
  const offenders: string[] = [];

  for (const file of walk(root)) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    if (!isScannable(rel)) continue;
    if (rel in ALLOWED || ALLOWED_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const names = importedNames(readFileSync(file, "utf8"));
    const used = BUNDLED.filter((n) => names.has(n));
    if (used.length > 0) offenders.push(`${rel} → ${used.join(", ")}`);
  }

  it("finds no unlisted consumer of CATEGORIES / CATEGORY_BY_ID / FIXED_CATEGORY_IDS", () => {
    expect(offenders).toEqual([]);
  });

  it("scans a meaningful number of files (the walk itself is not silently empty)", () => {
    // Invariant #6 applied to the guard: a scan that found nothing because it
    // looked nowhere must not pass as "clean".
    const scanned = walk(root).filter((f) =>
      isScannable(path.relative(process.cwd(), f).split(path.sep).join("/")),
    );
    expect(scanned.length).toBeGreaterThan(100);
  });

  it("would flag a file that imports the bundled set", () => {
    expect(importedNames('import { CATEGORIES } from "@/domain/models";').has("CATEGORIES")).toBe(true);
    expect(
      importedNames('import { categoryLabel, type CategoryDef } from "@/domain/models";').has("CategoryDef"),
    ).toBe(true);
  });
});
