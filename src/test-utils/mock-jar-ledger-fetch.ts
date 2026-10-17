/**
 * Test-side mirror of `POST /api/jar-ledger` (see `src/app/api/jar-ledger/route.ts`)
 * for `mock-jars-fetch.ts`. Same order of checks as the real handler — body shape
 * (1–50 entries, whole VND in (0, 10^12], Σ ≤ 10^12) → 404 unknown jar → 422 jar
 * without a stored row ("Khác" healed in on read) → 422 withdraw over a jar's
 * balance (`maxWithdraw`) → 422 over the CASA cap once on the whole batch — and the
 * batch is all-or-nothing. Balances come from the engine's own `jarBalances` on the
 * one `transferNow()` clock, so the mock can never disagree with the UI.
 */

import { balanceAsOf, dateToMonthKey, jarBalances, monthPeriodFromKey } from "@/domain/engine";
import { isJarAmount, MAX_JAR_AMOUNT } from "@/domain/jar-rules";
import type { JarConfig, JarLedgerEntry, JarLedgerInput, Transaction } from "@/domain/models";
import { transferNow } from "@/lib/demo-clock";
import { jsonResponse as json } from "./mock-json-response";

const MAX_BATCH = 50;

export interface LedgerPorts {
  readConfig: () => JarConfig;
  /** Ids with a real stored row (not the heal-synthesized "Khác"). */
  rowIds: () => ReadonlySet<string>;
  txns: (cif: string) => Transaction[];
  /** The cap rule shared with the jar routes: a 422 response, or null when it fits. */
  overCap: (next: JarConfig, cif: string) => Response | null;
  /** Persist the appended ledger and return the full config. */
  commitLedger: (ledger: JarLedgerEntry[]) => JarConfig;
}

function sanitize(input: unknown): JarLedgerInput[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_BATCH) return null;
  let total = 0;
  const out: JarLedgerInput[] = [];
  for (const item of input) {
    const e = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    if (typeof e.jarId !== "string" || e.jarId === "") return null;
    if (e.kind !== "deposit" && e.kind !== "withdraw") return null;
    if (!isJarAmount(e.amount) || e.amount === 0) return null;
    total += e.amount;
    if (total > MAX_JAR_AMOUNT) return null;
    out.push({ jarId: e.jarId, kind: e.kind, amount: e.amount });
  }
  return out;
}

export function handleJarLedgerRequest(init: RequestInit | undefined, ports: LedgerPorts): Response {
  if ((init?.method ?? "GET").toUpperCase() !== "POST") return json({ error: "method not allowed" }, 405);
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
  const cif = body?.cif;
  if (!cif || typeof cif !== "string") return json({ error: "cif is required" }, 422);
  const batch = sanitize(body?.entries);
  if (!batch) return json({ error: "entries is invalid" }, 422);

  const now = transferNow();
  const createdAt = now.toISOString();
  const entries: JarLedgerEntry[] = batch.map((e, i) => ({
    id: `led-${now.getTime()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    ...e,
    isOpening: false,
    createdAt,
    source: "self_reported",
  }));

  const config = ports.readConfig();
  const known = new Set(config.jars.map((j) => j.id));
  const rows = ports.rowIds();
  for (const e of entries) {
    if (!known.has(e.jarId)) return json({ error: "jar not found", jarId: e.jarId }, 404);
    if (!rows.has(e.jarId)) return json({ error: "jar not persisted", jarId: e.jarId }, 422);
  }
  const txns = ports.txns(cif);
  const period = monthPeriodFromKey(dateToMonthKey(now));
  const asOf = balanceAsOf(period, now);
  const applied = [...(config.ledger ?? [])];
  for (const e of entries) {
    if (e.kind === "withdraw") {
      const balance = jarBalances({ ...config, ledger: applied }, txns, asOf, period.to).get(e.jarId)?.balance ?? null;
      if (balance === null || balance < e.amount) {
        return json(
          { error: "over balance", jarId: e.jarId, maxWithdraw: balance === null ? null : Math.max(0, balance) },
          422,
        );
      }
    }
    applied.push(e);
  }
  const rejected = ports.overCap({ ...config, ledger: applied }, cif);
  if (rejected) return rejected;
  return json(ports.commitLedger(applied), 201);
}
