/**
 * `/api/jars*` moved from browser localStorage to a real fetch call
 * (`src/state/jars.tsx`), which cannot resolve a relative URL in the
 * Vitest/jsdom test environment (there's no server behind it). Tests that
 * render the real provider stack (`JarConfigProvider` over the real
 * `mock-provider.ts`) — by design, to exercise real component + state logic —
 * need a stand-in for that one network boundary. This stubs `fetch` against an
 * in-memory `JarConfig` and routes each request to a mirror of its real handler:
 * `mock-jars-routes.ts` (`/api/jars*`), `mock-jar-ledger-fetch.ts`
 * (`/api/jar-ledger`), `mock-bank-fetch.ts` (`/api/accounts*`,
 * `/api/transactions`), `mock-categories-fetch.ts` and `mock-corrections-fetch.ts`.
 * Business logic is never duplicated — only the HTTP/DB transport is faked.
 */

import { dedupeCategories } from "@/domain/jar-rules";
import { fitsCasaCap, jarSpendableTotal } from "@/domain/engine";
import type { Amount } from "@/domain/engine/types";
import type { JarConfig } from "@/domain/models";
import { DEFAULT_JAR_CONFIG } from "@/domain/models/jar-defaults";
import { currentMonthKey, transferNow } from "@/lib/demo-clock";
import {
  handleCategoriesRequest,
  mockAssignableCategoryIds,
  resetMockCategories,
} from "./mock-categories-fetch";
import { handleCorrectionsRequest, mockCorrectionUsage, resetMockCorrections } from "./mock-corrections-fetch";
import { monthAnchor, withSeedDeposits } from "./jar-ledger-fixtures";
import { handleJarLedgerRequest } from "./mock-jar-ledger-fetch";
import { handleJarsRequest, type JarsPorts } from "./mock-jars-routes";
import { handleAccountsRequest, handleTransactionsRequest, mockAccountsFor, mockTxnsFor, resetMockBank } from "./mock-bank-fetch";
import { jsonResponse } from "./mock-json-response";

/**
 * Σ spendable (`Σ max(0, balance)`) a config (jars + ledger) would hold, and
 * the CASA pool — via the shared engine `jarSpendableTotal`, the exact function the
 * real server guard uses (same `transferNow()` clock), so the mocked cap can never
 * disagree with the card or the client preview. Bank history only (`mockTxnsFor`).
 */
function spendableTotalFor(config: JarConfig, cif: string | null): { total: number; pool: Amount } {
  const accounts = cif ? mockAccountsFor(cif) : [];
  return jarSpendableTotal(config, accounts, mockTxnsFor(cif), transferNow());
}

let store: JarConfig = freshConfig();
/** Ids with a real `jars` row — the heal-synthesized "Khác" is not one (Red Team #5). */
let rowIds: Set<string> = new Set(store.jars.map((j) => j.id));
let originalFetch: typeof globalThis.fetch | undefined;

/**
 * The seeded config, mirroring `scripts/seed-db.mjs` + the jar-ledger migration:
 * `createdAt` = start of the demo month and one opening deposit = `budgetLimit` per
 * limited jar, so a persona's current-month balances equal the pre-split numbers.
 */
function freshConfig(): JarConfig {
  return withSeedDeposits(
    {
      version: 3,
      jars: DEFAULT_JAR_CONFIG.jars.map((j) => ({ ...j, categoryIds: [...j.categoryIds] })),
    },
    monthAnchor(currentMonthKey()),
  );
}

/**
 * The real `readJarConfig` normalizes (dedupe → heal → backfill)
 * UNCONDITIONALLY on every read, and every write handler's response comes
 * from calling it again afterward — so a write that only partially
 * normalizes (e.g. PATCH shrinking `categoryIds` without healing the
 * dropped category) still comes back healed. Routing every store update
 * AND every GET through this same commit point reproduces that guarantee
 * here, instead of each branch needing to remember to normalize.
 *
 * The heal runs against the PERSONA'S taxonomy (`mock-categories-fetch`), the
 * same set the real `readJarConfig` passes: that is what makes a category the
 * test just created land in "Khác" by itself, and what keeps an archived one from
 * being yanked out of the hũ it is already in.
 */
function commit(next: JarConfig, cif: string | null, write = true): JarConfig {
  // Mirror `writeJarConfig`: `createdAt` is server-owned (kept for an existing id,
  // stamped on the one clock for a new one — a client value is never trusted), and
  // the ledger is read-only on the wire: rows of jars that left the config go too.
  const createdById = new Map(store.jars.map((j) => [j.id, j.createdAt]));
  const nowIso = transferNow().toISOString();
  const jars = next.jars.map((j) => ({ ...j, createdAt: createdById.get(j.id) ?? nowIso }));
  const ids = new Set(jars.map((j) => j.id));
  // A write stores every jar it was handed (like `writeJarConfig`).
  if (write) rowIds = ids;
  const ledger = (next.ledger ?? store.ledger ?? []).filter((e) => ids.has(e.jarId));
  // Like the real `readJarConfig`: deduped only — a category no jar claims is
  // simply "chưa xếp hũ", nothing is invented to hold it.
  store = { ...dedupeCategories({ version: 3, jars }), ledger };
  return store;
}

/**
 * The server's cap rule (create, ledger batch, replace, category move), BALANCE
 * LENS: 422 only when the write RAISES Σ spendable (vs the stored config) AND the
 * new Σ exceeds CASA — lowering, clearing or re-saving always passes. `nextConfig`
 * is a WHOLE config: a caller folds any not-yet-written ledger row into it.
 */
function overCap(nextConfig: JarConfig, cif: string | null): Response | null {
  const next = spendableTotalFor(nextConfig, cif);
  const base = spendableTotalFor(store, cif);
  const cap = fitsCasaCap(next.total, base.total, next.pool);
  return cap.ok ? null : jsonResponse({ error: "over CASA cap", overBy: cap.overBy ?? null }, 422);
}

const jarsPorts: JarsPorts = { readConfig: () => store, commit, overCap };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Run a sync handler as a fetch would: a throw becomes a rejected promise. */
function settle(handler: () => Response): Promise<Response> {
  return new Promise((resolve) => resolve(handler()));
}

/** Install the fetch stub — safe to call more than once (no-ops after the first). */
export function installMockJarsApi(): void {
  if (originalFetch) return; // already installed
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.startsWith("/api/jars")) return settle(() => handleJarsRequest(url, init, jarsPorts));
    if (url.startsWith("/api/jar-ledger")) {
      return settle(() =>
        handleJarLedgerRequest(init, {
          readConfig: () => store,
          rowIds: () => rowIds,
          txns: (cif) => mockTxnsFor(cif),
          overCap: (next, cif) => overCap(next, cif),
          commitLedger: (ledger) => (store = { ...store, ledger }),
        }),
      );
    }
    if (url.startsWith("/api/accounts")) return settle(() => handleAccountsRequest(url, init));
    if (url.startsWith("/api/transactions")) return settle(() => handleTransactionsRequest(url, init));
    // The taxonomy stub reaches the hũ store through this port — a category write
    // is also a jar write server-side, and both must come back as one aggregate.
    const taxonomy = handleCategoriesRequest(url, init, {
      readJars: () => store,
      commitJars: (jars, cif) => commit({ version: 3, jars }, cif),
      usageCount: mockCorrectionUsage,
    });
    if (taxonomy) return Promise.resolve(taxonomy);
    const labels = handleCorrectionsRequest(url, init);
    if (labels) return Promise.resolve(labels);
    return originalFetch!(input as RequestInfo, init);
  }) as typeof fetch;
}

/** Reset the in-memory jar set, taxonomy, accounts and labels — call in `beforeEach`. */
export function resetMockJarsApi(): void {
  store = freshConfig();
  rowIds = new Set(store.jars.map((j) => j.id));
  resetMockBank();
  resetMockCategories();
  resetMockCorrections();
}
