import { describe, expect, it, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { PersonaProvider } from "@/providers/context";
import { CorrectionsProvider, useCorrections, type Assignment } from "@/state/corrections";
import { CategoryMemoryProvider } from "@/state/category-memory";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { JarConfigProvider } from "@/state/jars";
import { AssetLiabilityProvider } from "@/state/assets";
import { GoalProvider } from "@/state/goals";
import { PeriodProvider } from "@/state/period";
import { useFinancials, type Financials } from "@/state/useFinancials";
import type { Transaction } from "@/domain/models";
import { UNCLASSIFIED } from "@/domain/models";
import { monthPeriodFromKey } from "@/domain/engine";
import { currentMonthKey } from "@/lib/demo-clock";

/**
 * End-to-end (through the real provider stack, seeded "stable" persona data —
 * no fabricated transactions) coverage of invariant #6: a `pending` assignment
 * must never move a total, and only an `applied` one triggers the engine
 * recompute. `PfmTxnList.test.tsx` already exercises the *user*-correction path
 * (`setCategory`) through the picker UI; this covers the classify-pipeline
 * (`upsertAssignments`) path directly against `useFinancials`.
 */
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

let latest: {
  loading: boolean;
  allTransactions: Transaction[];
  financials: Financials | null;
  upsertAssignments: (a: Assignment[]) => void;
} | null = null;

function Probe() {
  const { loading, allTransactions, financials } = useFinancials();
  const { upsertAssignments } = useCorrections();
  latest = { loading, allTransactions, financials, upsertAssignments };
  return null;
}

function renderStack() {
  return render(
    <PersonaProvider>
      <CorrectionsProvider>
        <CategoryMemoryProvider>
          <ManualTxnsProvider>
            <JarConfigProvider>
                <AssetLiabilityProvider>
                  <GoalProvider>
                    <PeriodProvider>
                      <Probe />
                    </PeriodProvider>
                  </GoalProvider>
                </AssetLiabilityProvider>
            </JarConfigProvider>
          </ManualTxnsProvider>
        </CategoryMemoryProvider>
      </CorrectionsProvider>
    </PersonaProvider>,
  );
}

describe("useFinancials recompute on assignment status (invariant #6)", () => {
  it("pending assignment leaves totals untouched; applied assignment recomputes them", async () => {
    renderStack();
    await waitFor(() => expect(latest?.loading).toBe(false));

    const period = monthPeriodFromKey(currentMonthKey());
    const target = latest!.allTransactions.find(
      (t) =>
        t.categoryId === UNCLASSIFIED &&
        t.type === "expense" &&
        t.postedAt >= period.from &&
        t.postedAt <= period.to,
    );
    // The seeded "stable" persona ships real UNCLASSIFIED expenses (18% rate) —
    // if this ever fails, the fixture generator regressed, not this assertion.
    expect(target).toBeDefined();
    const txnId = target!.id;
    const amount = target!.amount;

    const expenseBefore = latest!.financials!.cashflow.expense;
    const unclBefore = latest!.financials!.categorySpend.find((r) => r.categoryId === UNCLASSIFIED)?.amount ?? 0;
    expect(unclBefore).toBeGreaterThan(0);

    // 1) PENDING assignment — invariant #6: not counted, category untouched.
    act(() => {
      latest!.upsertAssignments([{ txnId, categoryId: "dining", origin: "ai", status: "pending", confidence: 0.5 }]);
    });
    await waitFor(() => {
      expect(latest!.financials!.cashflow.expense).toBe(expenseBefore);
    });
    const unclAfterPending = latest!.financials!.categorySpend.find((r) => r.categoryId === UNCLASSIFIED)?.amount ?? 0;
    expect(unclAfterPending).toBe(unclBefore); // still bucketed as "Chưa phân loại"
    const diningAfterPending = latest!.financials!.categorySpend.find((r) => r.categoryId === "dining")?.amount ?? 0;

    // 2) APPLIED assignment for the SAME txn — recompute happens.
    act(() => {
      latest!.upsertAssignments([{ txnId, categoryId: "dining", origin: "ai", status: "applied" }]);
    });
    await waitFor(() => {
      const uncl = latest!.financials!.categorySpend.find((r) => r.categoryId === UNCLASSIFIED)?.amount ?? 0;
      expect(uncl).toBe(unclBefore - amount);
    });
    const diningAfterApplied = latest!.financials!.categorySpend.find((r) => r.categoryId === "dining")?.amount ?? 0;
    expect(diningAfterApplied).toBe(diningAfterPending + amount);
    // Total expense is a re-bucketing, never a re-sum — it stays the same.
    expect(latest!.financials!.cashflow.expense).toBe(expenseBefore);
  });
});
