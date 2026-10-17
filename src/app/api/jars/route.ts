import { NextRequest, NextResponse } from "next/server";
import { dedupeCategories, stripCategories, uniqueJarId } from "@/domain/jar-rules";
import type { JarConfig, JarLedgerEntry } from "@/domain/models";
import { getDb } from "@/lib/db";
import { transferNow } from "@/lib/demo-clock";
import { appendJarLedger, ledgerEntryId } from "@/lib/jar-ledger-store";
import { readJarConfig, sanitizeJarCreate, sanitizeJars, writeJarConfig } from "@/lib/jars-store";
import { capViolation, categoryViolation, reservedIdViolation } from "./jar-write-guards";

/**
 * Spending jars ("hũ") for one persona (`cif`), backed by `data/pfm.sqlite3`
 * (see `data/jars/schema.md`). Collection level — `cif` travels in the BODY here
 * (no `:id` in the path); the per-jar routes take it as a query param.
 *
 * This is where the jar invariants are enforced (`@/domain/jar-rules`): the
 * server is the single source of truth, so every write returns the resulting
 * `JarConfig` and the client just renders it (no client-side recompute, no
 * follow-up GET).
 *
 * Called by the browser only — `src/providers/mock/mock-provider.ts` is the
 * sole caller (architectural invariant #4). There is no batch PATCH any more
 * (plan 260923, Red Team #10): limits are edited per jar (`PATCH /api/jars/:id`)
 * and every deposit/withdraw goes through `POST /api/jar-ledger`.
 */

function missingCif() {
  return NextResponse.json({ error: "cif is required" }, { status: 422 });
}

/** GET /api/jars?cif= — the persona's jars, in display order. */
export async function GET(req: NextRequest) {
  const cif = req.nextUrl.searchParams.get("cif");
  if (!cif) return missingCif();
  return NextResponse.json(readJarConfig(cif));
}

/**
 * POST /api/jars — create one jar (body `{cif, jar, balance}`, plan 260923 D2).
 * `balance` (the opening deposit, ≥ 0, 0 allowed)
 * is REQUIRED whole VND ≤ 10^12; `jar.budgetLimit` (the monthly LIMIT) is OPTIONAL —
 * omitted/null = "chưa đặt" (never a stored 0). The id is made unique against the existing
 * set and the new jar's categories are taken away from whichever jar held them
 * (one-category-one-jar). The jar row and its opening ledger row (`is_opening`,
 * even for 0 — a known 0, not "chưa có số dư") are written in ONE transaction.
 * 422 on a sentinel id (`pool`, `unclassified`, `dieu-chinh-hu`, `khac`), a
 * non-expense category, a missing/invalid balance or an invalid (present) limit, or an opening
 * balance that raises Σ spendable past CASA (`overBy`).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const parsed = sanitizeJarCreate(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const { jar, balance } = parsed;
  const rejected = reservedIdViolation([jar.id], true) ?? categoryViolation(cif, jar.categoryIds);
  if (rejected) return rejected;

  const now = transferNow();
  const nowIso = now.toISOString();
  const current = readJarConfig(cif);
  const created = { ...jar, id: uniqueJarId(current.jars, jar.id) };
  const opening: JarLedgerEntry = {
    id: ledgerEntryId(now, "open"),
    jarId: created.id,
    kind: "deposit",
    amount: balance,
    isOpening: true,
    createdAt: nowIso,
    source: "self_reported",
  };
  // Red Team #3: the cap must see the opening deposit that is not written yet.
  const next: JarConfig = {
    version: 3,
    jars: [...stripCategories(current.jars, created.categoryIds), created],
    ledger: [...(current.ledger ?? []), opening],
  };
  const overCap = capViolation(cif, next, current, now);
  if (overCap) return overCap;

  getDb().transaction(() => {
    writeJarConfig(cif, next, nowIso);
    appendJarLedger(cif, [opening]);
  })();
  return NextResponse.json(readJarConfig(cif), { status: 201 });
}

/**
 * PUT /api/jars — REPLACE the persona's whole jar set (body `{cif, jars}`),
 * used by "áp mẫu" and "khôi phục mặc định". An arbitrary incoming set has not
 * been through the mutators, so it is deduped (no category claimed
 * twice) before it is stored. 422 on `pool`/`unclassified`/
 * `dieu-chinh-hu` ids (`khac` round-trips — a legacy stored jar), a
 * non-expense category, or a replace that raises Σ spendable past CASA. Creates
 * NO ledger rows; ledger rows of ids that leave the set go with them.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return missingCif();
  const jars = sanitizeJars(body?.jars);
  if (!jars) return NextResponse.json({ error: "jars is invalid" }, { status: 422 });
  if (new Set(jars.map((j) => j.id)).size !== jars.length) {
    return NextResponse.json({ error: "duplicate jar id" }, { status: 422 });
  }
  const rejected =
    reservedIdViolation(jars.map((j) => j.id), false) ?? categoryViolation(cif, jars.flatMap((j) => j.categoryIds));
  if (rejected) return rejected;

  // Deduped only: a category the incoming set does not claim (a preset-only
  // template next to the user's own categories) is simply "chưa xếp hũ" — nothing
  // is invented to hold it.
  const healed = dedupeCategories({ version: 3, jars });
  // D3: no deposits here — a new id has balance `null` until the user deposits.
  // The cap still runs (a category shuffle re-attributes spend since each anchor)
  // against the stored ledger + anchors of the ids that survive the replace.
  const now = transferNow();
  const current = readJarConfig(cif);
  const anchors = new Map(current.jars.map((j) => [j.id, j.createdAt]));
  const next: JarConfig = {
    ...healed,
    jars: healed.jars.map((j) => (anchors.get(j.id) ? { ...j, createdAt: anchors.get(j.id) } : j)),
    ledger: current.ledger ?? [],
  };
  const overCap = capViolation(cif, next, current, now);
  if (overCap) return overCap;
  return NextResponse.json(writeJarConfig(cif, next, now.toISOString()));
}
