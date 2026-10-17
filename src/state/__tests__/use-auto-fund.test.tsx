import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Account, JarConfig, Transaction } from "@/domain/models";
import { PersonaProvider } from "@/providers/context";
import { ManualTxnsProvider, useManualTxns } from "../manual-txns";
import { useAutoFund } from "../use-auto-fund";

/**
 * `useAutoFund` — the React half of the shared auto-fund unit (plan 260918-1120,
 * Phases 04/05). `auto-fund-core.test.ts` pins the pure funding/snapshot math
 * (preferred per the phase-07 test plan); THIS file renders the REAL hook
 * against a REAL `ManualTxnsProvider` (fetch-mocked, mirroring
 * `manual-txns.test.tsx`) to exercise the store orchestration the pure core
 * doesn't own: `commit`/`fundJar`/`reconcile`/`undo`/`changeSource`. The three
 * UI suites that consume this hook (`TransferConfirm`, `TransferCategorizeSection`,
 * `UnlabeledSpendSheet`) stub it out entirely, so THIS is the only place the
 * real logic is exercised end-to-end against a real store.
 *
 * `@/state/jars` and `@/state/useFinancials` are mocked (static jar config;
 * `transactions` reactively composed from the REAL `useManualTxns()`) — the
 * same convention `TransferConfirm.test.tsx` uses — so the test stays
 * deterministic without needing the full provider/API stack.
 */

const h = vi.hoisted(() => ({
  jarConfig: { version: 3, jars: [] } as JarConfig,
  accounts: [] as Account[],
}));

vi.mock("@/state/jars", () => ({
  useJarConfig: () => ({ config: h.jarConfig, loaded: true }),
}));

vi.mock("@/state/useFinancials", async () => {
  const manual = await import("../manual-txns");
  return {
    useFinancials: () => {
      const { manualTxns } = manual.useManualTxns();
      return { transactions: manualTxns, raw: { accounts: h.accounts } };
    },
  };
});

/** In-memory stand-in for `/api/manual-transactions` (mirrors manual-txns.test.tsx). */
const db = new Map<string, Transaction[]>();

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost");
      const cif = url.searchParams.get("cif") ?? "";
      const method = init?.method ?? "GET";
      const rows = db.get(cif) ?? [];

      if (method === "GET") return new Response(JSON.stringify(rows), { status: 200 });
      if (method === "POST") {
        const { cif: c, txn } = JSON.parse(String(init?.body)) as { cif: string; txn: Transaction };
        const list = (db.get(c) ?? []).filter((t) => t.id !== txn.id);
        db.set(c, [{ ...txn, source: "self_reported" }, ...list]);
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      if (method === "PATCH") {
        const { cif: c, id, patch } = JSON.parse(String(init?.body)) as {
          cif: string;
          id: string;
          patch: Record<string, unknown>;
        };
        const list = db.get(c) ?? [];
        const idx = list.findIndex((t) => t.id === id);
        if (idx === -1) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
        const next = { ...list[idx], userEdited: true } as Record<string, unknown>;
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        list[idx] = next as unknown as Transaction;
        return new Response(JSON.stringify(next), { status: 200 });
      }
      if (method === "DELETE") {
        const id = url.searchParams.get("id");
        db.set(cif, (db.get(cif) ?? []).filter((t) => t.id !== id));
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 405 });
    }),
  );
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <PersonaProvider>
    <ManualTxnsProvider>{children}</ManualTxnsProvider>
  </PersonaProvider>
);

function useHarness() {
  const manual = useManualTxns();
  const autoFund = useAutoFund();
  return { ...autoFund, manualTxns: manual.manualTxns, addTxn: manual.add, updateTxn: manual.update };
}

function account(id: string, availableBalance: number): Account {
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

/** Rebalance records touching one trigger, from the harness's own store. */
function rebalancesFor(manualTxns: Transaction[], triggerTxnId: string) {
  return manualTxns.filter((t) => t.rebalance?.triggerTxnId === triggerTxnId);
}

beforeEach(() => {
  db.clear();
  window.localStorage.clear();
  installFetchMock();
});

describe("useAutoFund — fundJar (role waterfall commit)", () => {
  it("funds a jar's overspend from the top-priority role donor (buffer before essential, goal excluded)", async () => {
    // food's OWN limit is excluded from CASA, so the pool stays 0 the instant food
    // overspends (claimed drops by exactly the floored amount) — isolating the
    // role-waterfall choice to the real jar donors.
    h.jarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
        { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 6_000_000, role: "buffer" },
        { id: "ess", label: "Thiết yếu", categoryIds: ["housing"], budgetLimit: 5_000_000, role: "essential" },
      ],
    };
    h.accounts = [account("cur", 11_000_000)]; // buf(6M) + ess(5M)

    const { result } = renderHook(() => useHarness(), { wrapper });
    let triggerId = "";
    act(() => {
      triggerId = result.current.addTxn({
        amount: 4_500_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Siêu thị",
        postedAt: "2026-09-05T10:00:00.000Z",
      });
    });

    let fundResult: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      fundResult = result.current.fundJar({
        targetJarId: "food",
        triggerTxnId: triggerId,
        postedAt: "2026-09-05T10:00:00.000Z",
        origin: "auto",
      });
    });

    expect(fundResult?.status).toBe("funded");
    expect(fundResult?.donors).toEqual([{ jarId: "buf", label: "Hũ Dự phòng", take: 500_000 }]);

    const rebs = rebalancesFor(result.current.manualTxns, triggerId);
    expect(rebs).toHaveLength(1);
    expect(rebs[0]).toMatchObject({ categoryId: "dieu-chinh-hu", amount: 500_000 });
    expect(rebs[0].rebalance).toMatchObject({ fromJarId: "buf", toJarId: "food", origin: "auto" });
  });
});

describe("useAutoFund — C5: a declined goal-only shortfall is a durable 'needs manual cover' state, never silent", () => {
  const setup = () => {
    h.jarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
        { id: "goal", label: "Mục tiêu", categoryIds: ["goal-save"], budgetLimit: 5_000_000, role: "goal" },
      ],
    };
    h.accounts = [account("cur", 5_000_000)]; // only goal's limit — food's own limit excluded
  };

  it("fundJar returns needs-goal and writes NOTHING when only a protected `goal` jar can cover", async () => {
    setup();
    const { result } = renderHook(() => useHarness(), { wrapper });
    let triggerId = "";
    act(() => {
      triggerId = result.current.addTxn({
        amount: 4_800_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Nhà hàng",
        postedAt: "2026-09-05T10:00:00.000Z",
      });
    });

    let r1: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      r1 = result.current.fundJar({ targetJarId: "food", triggerTxnId: triggerId, postedAt: "2026-09-05T10:00:00.000Z", origin: "auto" });
    });
    expect(r1?.status).toBe("needs-goal");
    expect(r1?.goalDonors).toEqual([{ jarId: "goal", label: "Hũ Mục tiêu", take: 800_000 }]);
    expect(r1?.createdIds).toEqual([]);
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(0);

    // Decline (caller never calls includeGoal) — retrying without confirmation
    // STAYS needs-goal, never silently resolves or auto-writes on its own.
    let r2: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      r2 = result.current.fundJar({ targetJarId: "food", triggerTxnId: triggerId, postedAt: "2026-09-05T10:00:00.000Z", origin: "auto" });
    });
    expect(r2?.status).toBe("needs-goal");
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(0); // still nothing written
  });

  // REGRESSION — pins a REAL bug found while writing this suite (reported to the
  // orchestrator, not silently worked around): `fundJar`'s tier check
  // (`use-auto-fund.ts`) is `if (assessment.requiresManualGoal && !p.includeGoal)
  // return needs-goal; if (assessment.tier === "insufficient") return insufficient;`.
  // But `jar-funding.ts`'s `assess()` NEVER sets `requiresManualGoal: true` on any
  // tier other than `"insufficient"` (see `evaluateFunding` — the flag is only ever
  // set inside the `tier: "insufficient"` branch). So the SECOND check is always hit
  // for a requiresManualGoal case even after an explicit confirm, and `commit()` is
  // unreachable — a confirmed "Xác nhận rút" in `TransferCategorizeSection.tsx` /
  // `UnlabeledSpendSheet.tsx` (both call `reconcile(..., includeGoal: true)` →
  // `fundJar(..., includeGoal: true)`) silently reports "insufficient" / "cần bù thủ
  // công" instead of committing the confirmed goal donor. This test encodes the
  // DOCUMENTED/intended contract and is expected to fail until `fundJar` is fixed
  // (e.g. gate the second check on `!assessment.requiresManualGoal` too, mirroring
  // `TransferConfirm.tsx`'s own correct `tier === "insufficient" && !requiresManualGoal`).
  it("an explicit confirm (includeGoal) commits the goal chain and resolves the shortfall", async () => {
    setup();
    const { result } = renderHook(() => useHarness(), { wrapper });
    let triggerId = "";
    act(() => {
      triggerId = result.current.addTxn({
        amount: 4_800_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Nhà hàng",
        postedAt: "2026-09-05T10:00:00.000Z",
      });
    });

    let r: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      r = result.current.fundJar({
        targetJarId: "food",
        triggerTxnId: triggerId,
        postedAt: "2026-09-05T10:00:00.000Z",
        origin: "manual",
        includeGoal: true,
      });
    });
    expect(r?.status).toBe("funded");
    const rebs = rebalancesFor(result.current.manualTxns, triggerId);
    expect(rebs).toHaveLength(1);
    expect(rebs[0]).toMatchObject({ amount: 800_000 });
    expect(rebs[0].rebalance).toMatchObject({ fromJarId: "goal", toJarId: "food", origin: "manual" });
  });
});

describe("useAutoFund — H3: refund reconciliation shrinks/removes the rebalance, never blanket-deletes state", () => {
  const setup = () => {
    h.jarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
        { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 6_000_000, role: "buffer" },
      ],
    };
    h.accounts = [account("cur", 6_000_000)]; // buf's limit only — food's own limit excluded (pool stays 0)
  };

  it("a PARTIAL refund shrinks the rebalance to the residual overspend (one record, new amount — not two, not deleted)", async () => {
    setup();
    const { result } = renderHook(() => useHarness(), { wrapper });
    let triggerId = "";
    act(() => {
      triggerId = result.current.addTxn({
        amount: 4_800_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Nhà hàng",
        postedAt: "2026-09-05T10:00:00.000Z",
      });
    });
    act(() => {
      result.current.fundJar({ targetJarId: "food", triggerTxnId: triggerId, postedAt: "2026-09-05T10:00:00.000Z", origin: "auto" });
    });
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toEqual([
      expect.objectContaining({ amount: 800_000 }),
    ]);

    // Partial refund: 500k comes back — the trigger's effective spend drops to 4.3M.
    act(() => {
      result.current.updateTxn(triggerId, { amount: 4_300_000 });
    });
    let reconciled: ReturnType<NonNullable<typeof result.current.reconcile>> | undefined;
    act(() => {
      reconciled = result.current.reconcile({
        triggerTxnId: triggerId,
        categoryId: "dining",
        postedAt: "2026-09-05T10:00:00.000Z",
        origin: "auto",
        override: { amount: 4_300_000 },
      });
    });
    expect(reconciled?.status).toBe("funded");

    const rebs = rebalancesFor(result.current.manualTxns, triggerId);
    expect(rebs).toHaveLength(1); // shrunk, not doubled
    expect(rebs[0].amount).toBe(300_000); // the residual overspend only
  });

  it("a refund that FULLY clears the overspend removes the rebalance entirely (status covered, nothing left)", async () => {
    setup();
    const { result } = renderHook(() => useHarness(), { wrapper });
    let triggerId = "";
    act(() => {
      triggerId = result.current.addTxn({
        amount: 4_800_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Nhà hàng",
        postedAt: "2026-09-05T10:00:00.000Z",
      });
    });
    act(() => {
      result.current.fundJar({ targetJarId: "food", triggerTxnId: triggerId, postedAt: "2026-09-05T10:00:00.000Z", origin: "auto" });
    });
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(1);

    // Full refund down to well within budget.
    act(() => {
      result.current.updateTxn(triggerId, { amount: 3_500_000 });
    });
    let reconciled: ReturnType<NonNullable<typeof result.current.reconcile>> | undefined;
    act(() => {
      reconciled = result.current.reconcile({
        triggerTxnId: triggerId,
        categoryId: "dining",
        postedAt: "2026-09-05T10:00:00.000Z",
        origin: "auto",
        override: { amount: 3_500_000 },
      });
    });
    expect(reconciled?.status).toBe("covered");
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(0); // removed, not lingering
  });
});

describe("useAutoFund — H4: reconcile derives its snapshot from the TRIGGER's own month, not the viewed/current month", () => {
  it("an August trigger funds against August spend only, even though a September spend exists in the same jar", async () => {
    h.jarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
        { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 6_000_000, role: "buffer" },
      ],
    };
    h.accounts = [account("cur", 6_000_000)];

    const { result } = renderHook(() => useHarness(), { wrapper });
    let augTrigger = "";
    act(() => {
      // A September spend exists in the SAME jar/category — must never leak into
      // August's shortfall calculation.
      result.current.addTxn({
        amount: 5_000_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Tháng 9",
        postedAt: "2026-09-01T10:00:00.000Z",
      });
      augTrigger = result.current.addTxn({
        amount: 4_500_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Tháng 8 (backdated)",
        postedAt: "2026-08-20T10:00:00.000Z",
      });
    });

    let r: ReturnType<typeof result.current.fundJar> | undefined;
    act(() => {
      r = result.current.fundJar({ targetJarId: "food", triggerTxnId: augTrigger, postedAt: "2026-08-20T10:00:00.000Z", origin: "auto" });
    });
    // August-only overspend is 500k (4.5M − 4M), NOT the 5.5M a September-anchored
    // read would compute (4M+5M spent this jar combined − 4M limit).
    expect(r?.status).toBe("funded");
    expect(r?.donors).toEqual([{ jarId: "buf", label: "Hũ Dự phòng", take: 500_000 }]);
    const rebs = rebalancesFor(result.current.manualTxns, augTrigger);
    expect(rebs[0]).toMatchObject({ amount: 500_000, postedAt: "2026-08-20T10:00:00.000Z" });
  });
});

describe("useAutoFund — reconcile re-entrancy: an already-settled trigger is a no-op, never doubles the rebalance", () => {
  it("calling reconcile again after the shortfall is already covered returns 'covered' and creates nothing further", async () => {
    h.jarConfig = {
      version: 3,
      jars: [
        { id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000, role: "spending" },
        { id: "buf", label: "Dự phòng", categoryIds: ["buffer-cat"], budgetLimit: 6_000_000, role: "buffer" },
      ],
    };
    h.accounts = [account("cur", 6_000_000)];

    const { result } = renderHook(() => useHarness(), { wrapper });
    let triggerId = "";
    act(() => {
      triggerId = result.current.addTxn({
        amount: 4_500_000,
        direction: "debit",
        categoryId: "dining",
        type: "expense",
        merchantName: "Siêu thị",
        postedAt: "2026-09-05T10:00:00.000Z",
      });
    });
    act(() => {
      result.current.reconcile({ triggerTxnId: triggerId, categoryId: "dining", postedAt: "2026-09-05T10:00:00.000Z", origin: "auto" });
    });
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(1);

    // Re-run reconcile with nothing changed — it unwinds the existing rebalance and
    // re-evaluates; the shortfall is exactly the same, so exactly ONE record exists
    // afterward (a fresh one replacing the old), never two.
    let second: ReturnType<NonNullable<typeof result.current.reconcile>> | undefined;
    act(() => {
      second = result.current.reconcile({ triggerTxnId: triggerId, categoryId: "dining", postedAt: "2026-09-05T10:00:00.000Z", origin: "auto" });
    });
    expect(second?.status).toBe("funded");
    expect(rebalancesFor(result.current.manualTxns, triggerId)).toHaveLength(1);
  });
});
