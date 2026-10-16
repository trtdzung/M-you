import { describe, it, expect } from "vitest";
import type { Jar } from "@/domain/models";
import { resyncActualOnRaise } from "../jar-rules";

function jar(over: Partial<Jar>): Jar {
  return { id: "food", label: "Ăn uống", categoryIds: [], ...over };
}

describe("resyncActualOnRaise (H3)", () => {
  it("raises actualAmount to the new limit when the jar is undrawn (actualAmount === old limit)", () => {
    const prev = jar({ budgetLimit: 3_000_000, actualAmount: 3_000_000 });
    const next = jar({ budgetLimit: 5_000_000, actualAmount: 3_000_000 });
    expect(resyncActualOnRaise(prev, next).actualAmount).toBe(5_000_000);
  });

  it("does NOT touch actualAmount when the limit is LOWERED (never vaporises wallet money)", () => {
    const prev = jar({ budgetLimit: 5_000_000, actualAmount: 5_000_000 });
    const next = jar({ budgetLimit: 3_000_000, actualAmount: 5_000_000 });
    expect(resyncActualOnRaise(prev, next).actualAmount).toBe(5_000_000);
  });

  it("does NOT raise actualAmount when the jar was already drawn from (actualAmount !== old limit)", () => {
    const prev = jar({ budgetLimit: 3_000_000, actualAmount: 1_000_000 }); // spent 2tr from wallet
    const next = jar({ budgetLimit: 5_000_000, actualAmount: 1_000_000 });
    expect(resyncActualOnRaise(prev, next).actualAmount).toBe(1_000_000);
  });

  it("leaves a jar with no previous limit to the backfill path (no resync)", () => {
    const prev = jar({ budgetLimit: undefined, actualAmount: undefined });
    const next = jar({ budgetLimit: 5_000_000, actualAmount: undefined });
    expect(resyncActualOnRaise(prev, next).actualAmount).toBeUndefined();
  });
});
