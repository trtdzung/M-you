import { describe, it, expect } from "vitest";
import type { Jar } from "@/domain/models";
import { fitsCasaCap } from "../allocation-plan";

function jar(id: string, budgetLimit?: number): Jar {
  return { id, label: id, categoryIds: [], budgetLimit };
}

describe("fitsCasaCap", () => {
  const JARS = [jar("food", 5_000_000), jar("bills", 7_000_000), jar("savings")];

  it("Σ budgetLimit exactly equal to CASA → ok", () => {
    expect(fitsCasaCap(JARS, 12_000_000, {})).toEqual({ ok: true });
  });

  it("Σ over CASA by 1 VND → fail with overBy", () => {
    expect(fitsCasaCap(JARS, 11_999_999, {})).toEqual({ ok: false, overBy: 1 });
  });

  it("applies drafts as the final state (not per-jar) before summing", () => {
    // food 5tr → 6tr, bills 7tr → 4tr ⇒ Σ = 10tr ≤ 12tr
    expect(fitsCasaCap(JARS, 12_000_000, { food: 6_000_000, bills: 4_000_000 })).toEqual({ ok: true });
    // food 5tr → 9tr ⇒ Σ = 16tr > 12tr by 4tr
    expect(fitsCasaCap(JARS, 12_000_000, { food: 9_000_000 })).toEqual({ ok: false, overBy: 4_000_000 });
  });

  it("a jar with undefined budgetLimit (savings) is not counted", () => {
    expect(fitsCasaCap([jar("food", 8_000_000), jar("savings")], 8_000_000, {})).toEqual({ ok: true });
  });

  it("a draft can newly fund a previously-unset jar", () => {
    expect(fitsCasaCap([jar("food", 8_000_000), jar("savings")], 8_000_000, { savings: 1 })).toEqual({
      ok: false,
      overBy: 1,
    });
  });

  it("pool unknown → blocked (ok:false, no overBy)", () => {
    expect(fitsCasaCap(JARS, "unknown", {})).toEqual({ ok: false });
  });

  it("empty jars / empty drafts → ok trivially", () => {
    expect(fitsCasaCap([], 0, {})).toEqual({ ok: true });
  });

  it("ignores non-finite draft values", () => {
    expect(fitsCasaCap([jar("food", 5_000_000)], 5_000_000, { food: Number.NaN })).toEqual({ ok: true });
  });
});
