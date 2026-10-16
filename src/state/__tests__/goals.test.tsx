import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PersonaProvider, usePersona } from "@/providers/context";
import { CorrectionsProvider } from "@/state/corrections";
import { ManualTxnsProvider } from "@/state/manual-txns";
import { JarConfigProvider } from "@/state/jars";
import { JarAllocationsProvider } from "@/state/jar-allocations";
import { PeriodProvider } from "@/state/period";
import { AssetLiabilityProvider } from "@/state/assets";
import type { GoalFields } from "@/domain/models/goal-input";
import { GoalProvider, useGoals } from "../goals";
import { useFinancials } from "../useFinancials";

/**
 * Red-team #2 (live merged goals — user goals are context state in the `useMemo`,
 * not the stale one-time `raw` fetch), #3 (no double-count — `listGoals()` seed
 * stays separate), #4 (per-record drop-notice), #6 (unknown stays unknown),
 * #7 (no cross-persona data mid-switch, persists per persona).
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <PersonaProvider>
      <CorrectionsProvider>
      <ManualTxnsProvider>
        <JarConfigProvider>
          <JarAllocationsProvider>
            <AssetLiabilityProvider>
              <GoalProvider>
                <PeriodProvider>{children}</PeriodProvider>
              </GoalProvider>
            </AssetLiabilityProvider>
          </JarAllocationsProvider>
        </JarConfigProvider>
        </ManualTxnsProvider>
    </CorrectionsProvider>
    </PersonaProvider>
  );
}

const fields = (over: Partial<GoalFields> = {}): GoalFields => ({
  name: "Quỹ dự phòng test",
  targetAmount: 100_000_000,
  targetDate: null,
  monthlyContribution: 5_000_000,
  ...over,
});

function renderState() {
  return renderHook(
    () => ({ g: useGoals(), fin: useFinancials(), persona: usePersona() }),
    { wrapper },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("GoalProvider — live merged goals", () => {
  it("[#2/#3] add / edit / delete recompute the merged goal view (no double-count)", async () => {
    const { result } = renderState();
    await waitFor(() => expect(result.current.fin.financials).not.toBeNull());
    const seedCount = result.current.fin.financials!.goals.length;

    // ADD — merged goals grow by exactly one (user goal counted once, not twice).
    act(() => result.current.g.createGoal(fields()));
    await waitFor(() =>
      expect(result.current.fin.financials!.goals.length).toBe(seedCount + 1),
    );
    const id = result.current.g.goals[0].id;
    const matches = result.current.fin.financials!.goals.filter((x) => x.id === id);
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("self_reported");

    // EDIT — recompute reflects the new target.
    act(() => result.current.g.updateGoal(id, fields({ targetAmount: 42_000_000 })));
    await waitFor(() =>
      expect(result.current.fin.financials!.goals.find((x) => x.id === id)!.targetAmount).toBe(42_000_000),
    );

    // DELETE — back to the seed-only baseline.
    act(() => result.current.g.deleteGoal(id));
    await waitFor(() =>
      expect(result.current.fin.financials!.goals.length).toBe(seedCount),
    );
  });

  it("[#6] an unset monthly contribution stays null, never 0", async () => {
    const { result } = renderState();
    await waitFor(() => expect(result.current.fin.financials).not.toBeNull());

    act(() => result.current.g.createGoal(fields({ monthlyContribution: null })));
    await waitFor(() => expect(result.current.g.goals).toHaveLength(1));
    expect(result.current.g.goals[0].monthlyContribution).toBeNull();
    // A brand-new goal has genuinely 0 saved (a real starting value, not a mask).
    expect(result.current.g.goals[0].currentAmount).toBe(0);
  });

  it("[#7] no cross-persona data mid-switch; persists per persona (round-trip)", async () => {
    const { result } = renderState();
    await waitFor(() => expect(result.current.fin.financials).not.toBeNull());

    act(() => result.current.g.createGoal(fields({ targetAmount: 7_000_000 })));
    await waitFor(() => expect(result.current.g.goals).toHaveLength(1));

    // Switch away → the switched-to persona shows NONE of stable's user goals.
    act(() => result.current.persona.setPersona("wealthy"));
    await waitFor(() => expect(result.current.g.goals).toHaveLength(0));

    // Switch back → stable's goal is restored from its own persona key.
    act(() => result.current.persona.setPersona("stable"));
    await waitFor(() => expect(result.current.g.goals).toHaveLength(1));
    expect(result.current.g.goals[0].targetAmount).toBe(7_000_000);
  });

  it("[#4] surfaces a drop notice when the guard discards a corrupt stored goal", async () => {
    window.localStorage.setItem(
      "msb-pfm.goals.stable",
      JSON.stringify({
        version: 1,
        records: [
          { id: "ok", name: "Hợp lệ", targetAmount: 10_000_000, currentAmount: 0, targetDate: null, source: "self_reported", monthlyContribution: null },
          { id: "bad" },
        ],
      }),
    );

    const { result } = renderState();
    await waitFor(() => expect(result.current.g.goals).toHaveLength(1));
    expect(result.current.g.goals[0].id).toBe("ok"); // sibling survived
    expect(result.current.g.dropped).toBe(1);

    act(() => result.current.g.dismissDropNotice());
    expect(result.current.g.dropped).toBe(0);
  });
});
