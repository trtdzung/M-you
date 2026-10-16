import { vi } from "vitest";
import type { ReactNode } from "react";
import type { Account, Transaction } from "@/domain/models";
import { PersonaProvider } from "@/providers/context";
import { ManualTxnsProvider, useManualTxns } from "../manual-txns";
import { useAutoFund } from "../use-auto-fund";

/**
 * Shared harness for the `useAutoFund` suites: an in-memory stand-in for
 * `/api/manual-transactions` behind a REAL `ManualTxnsProvider` (mirrors
 * `manual-txns.test.tsx`). `failPosts` makes every POST answer 500 so the awaited
 * write path (H14/U1) can be exercised. The `vi.mock` of jars/useFinancials stays
 * in each suite (hoisting only applies inside the test file).
 */

export const db = new Map<string, Transaction[]>();
export const net = { failPosts: false };

export function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost");
      const cif = url.searchParams.get("cif") ?? "";
      const method = init?.method ?? "GET";
      if (method === "GET") return new Response(JSON.stringify(db.get(cif) ?? []), { status: 200 });
      if (method === "POST") {
        if (net.failPosts) return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
        const { cif: c, txn } = JSON.parse(String(init?.body)) as { cif: string; txn: Transaction };
        db.set(c, [{ ...txn, source: "self_reported" }, ...(db.get(c) ?? []).filter((t) => t.id !== txn.id)]);
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      if (method === "DELETE") {
        const id = url.searchParams.get("id");
        db.set(cif, (db.get(cif) ?? []).filter((t) => t.id !== id));
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 }); // PATCH: not asserted here
    }),
  );
}

export const wrapper = ({ children }: { children: ReactNode }) => (
  <PersonaProvider>
    <ManualTxnsProvider>{children}</ManualTxnsProvider>
  </PersonaProvider>
);

export function useHarness() {
  const manual = useManualTxns();
  const autoFund = useAutoFund();
  return { ...autoFund, manualTxns: manual.manualTxns, addTxn: manual.add, updateTxn: manual.update };
}

export function account(id: string, availableBalance: number): Account {
  return {
    id,
    type: "current",
    institution: "MSB",
    currency: "VND",
    balance: availableBalance,
    availableBalance,
    lastSyncedAt: "2026-09-15T00:00:00.000Z",
    source: "msb",
    maskedNumber: "•••• 0000",
    accountNumber: "000000000000",
  };
}

/** A self-reported expense input in `categoryId` on `postedAt`. */
export function spend(amount: number, categoryId: string, postedAt = "2026-09-05T10:00:00.000Z") {
  return { amount, direction: "debit" as const, categoryId, type: "expense" as const, merchantName: "Chi tiêu", postedAt };
}

/** Rebalance records touching one trigger. */
export function rebalancesFor(manualTxns: Transaction[], triggerTxnId: string) {
  return manualTxns.filter((t) => t.rebalance?.triggerTxnId === triggerTxnId);
}

/** Every rebalance record in the store. */
export function allRebalances(manualTxns: Transaction[]) {
  return manualTxns.filter((t) => t.rebalance);
}
