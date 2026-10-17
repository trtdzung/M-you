/**
 * Test fixture helper mirroring the one-time jar-ledger migration
 * (`src/lib/db-migrate-jar-ledger.ts`) and `scripts/seed-db.mjs`: every jar gets
 * `createdAt = anchorIso`, and every jar with a non-NULL `budgetLimit` (0 included)
 * gets ONE opening deposit of that amount at the same instant. Jars with no limit
 * get no deposit, so their balance stays `null` (invariant #6).
 *
 * With the anchor at the start of the viewed month, the running balance equals the
 * pre-split single-number model (`limit − spent + rebalanceNet`) for that month —
 * which is what legacy engine tests assumed.
 */

import type { JarConfig, JarLedgerEntry } from "@/domain/models";
import { monthPeriodFromKey } from "@/domain/engine/types";

/** Start (VN, UTC ISO) of a "YYYY-MM" month — the migration's anchor rule. */
export function monthAnchor(monthKey: string): string {
  return monthPeriodFromKey(monthKey).from;
}

/** Opening deposit row for a jar (ids match the migration's `led-mig-<jarId>`). */
export function openingDeposit(jarId: string, amount: number, createdAt: string): JarLedgerEntry {
  return {
    id: `led-mig-${jarId}`,
    jarId,
    kind: "deposit",
    amount,
    isOpening: true,
    createdAt,
    source: "self_reported",
  };
}

/** `config` with migration-style `createdAt` + opening deposits (existing ledger kept). */
export function withSeedDeposits(config: JarConfig, anchorIso: string): JarConfig {
  const jars = config.jars.map((j) => ({ ...j, createdAt: j.createdAt ?? anchorIso }));
  const seeded = config.jars
    .filter((j) => typeof j.budgetLimit === "number" && Number.isFinite(j.budgetLimit) && j.budgetLimit >= 0)
    .filter((j) => !(config.ledger ?? []).some((e) => e.jarId === j.id && e.isOpening))
    .map((j) => openingDeposit(j.id, j.budgetLimit as number, anchorIso));
  return { ...config, jars, ledger: [...(config.ledger ?? []), ...seeded] };
}
