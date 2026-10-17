/**
 * Test-side mirror of the persona's bank data over the fetch boundary, for
 * `mock-jars-fetch.ts`: `/api/accounts` (+ `/debit`) and `/api/transactions`.
 * Stands in for the `server-only` `accounts-store.ts` / `transactions-store.ts`
 * and is seeded from the same canonical builders as the fixtures/DB. A debit
 * lowers `balance` + `availableBalance`, so tests exercise the real "money
 * leaves the account" behaviour; the jar cap and ledger mirrors read the same
 * accounts and history through `mockAccountsFor` / `mockTxnsFor`.
 */

import type { Account, Transaction } from "@/domain/models";
import { PERSONA_LIST } from "@/providers/mock/personas";
import { buildPersonaAccounts, generateDataset } from "@/providers/mock/fixtures/generate";
import { jsonResponse } from "./mock-json-response";

/** In-memory accounts per persona (mutable — debits apply here). */
let accountsStore: Record<string, Account[]> = {};
/** Generated history per persona — read-only and deterministic, so memoized across resets. */
const txnCache: Record<string, Transaction[]> = {};

/** The persona's accounts (seeded lazily); empty for a non-persona cif. */
export function mockAccountsFor(cif: string): Account[] {
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return [];
  if (!accountsStore[cif]) accountsStore[cif] = buildPersonaAccounts(persona);
  return accountsStore[cif];
}

/** The persona's generated bank history (memoized); empty for a missing/non-persona cif. */
export function mockTxnsFor(cif: string | null): Transaction[] {
  if (!cif) return [];
  const persona = PERSONA_LIST.find((p) => p.cif === cif);
  if (!persona) return [];
  txnCache[cif] ??= generateDataset(persona).transactions;
  return txnCache[cif];
}

/**
 * `GET /api/transactions`: the persona's history bounded by inclusive
 * `from`/`to`, newest first.
 */
export function handleTransactionsRequest(url: string, init?: RequestInit): Response {
  const parsed = new URL(url, "http://localhost");
  if ((init?.method ?? "GET").toUpperCase() !== "GET") return jsonResponse({ error: "unhandled" }, 500);
  const cif = parsed.searchParams.get("cif");
  if (!cif) return jsonResponse({ error: "cif is required" }, 422);
  const from = parsed.searchParams.get("from");
  const to = parsed.searchParams.get("to");
  const rows = mockTxnsFor(cif)
    .filter((t) => (!from || t.postedAt >= from) && (!to || t.postedAt <= to))
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  return jsonResponse(rows);
}

/**
 * `/api/accounts` + `/api/accounts/debit`: GET lists the persona's accounts,
 * POST /debit lowers `balance` + `availableBalance` (floored at 0) on the target row.
 */
export function handleAccountsRequest(url: string, init?: RequestInit): Response {
  const parsed = new URL(url, "http://localhost");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;

  if (parsed.pathname === "/api/accounts/debit") {
    if (method !== "POST") return jsonResponse({ error: "unhandled" }, 500);
    const cif = typeof body?.cif === "string" ? body.cif : null;
    const accountId = typeof body?.accountId === "string" ? body.accountId : null;
    const amount = typeof body?.amount === "number" ? body.amount : null;
    if (!cif || !accountId || amount === null || amount < 0) {
      return jsonResponse({ error: "cif, accountId and amount ≥ 0 required" }, 422);
    }
    const target = mockAccountsFor(cif).find((a) => a.id === accountId);
    if (!target) return jsonResponse({ error: `account ${accountId} not found` }, 404);
    target.balance = Math.max(0, target.balance - amount);
    target.availableBalance = Math.max(0, target.availableBalance - amount);
    return jsonResponse(target);
  }

  const cif = parsed.searchParams.get("cif");
  if (method === "GET") {
    if (!cif) return jsonResponse({ error: "cif required" }, 422);
    return jsonResponse(mockAccountsFor(cif));
  }
  return jsonResponse({ error: "unhandled" }, 500);
}

/** Drop every debit (accounts re-seed lazily); the deterministic history cache is kept. */
export function resetMockBank(): void {
  accountsStore = {};
}
