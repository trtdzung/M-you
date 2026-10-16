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

describe("fitsCasaCap — only an INCREASE of Σ can be rejected (S5)", () => {
  const OVER = [jar("a", 40_000_000), jar("b", 30_000_000)]; // Σ 70tr

  it("lowering a limit on an already-over-cap config passes even if still over (A34)", () => {
    expect(fitsCasaCap(OVER, 57_600_000, { a: 35_000_000 })).toEqual({ ok: true });
  });

  it("re-saving the same value passes when CASA dropped below Σ (C08)", () => {
    expect(fitsCasaCap(OVER, 52_600_000, { a: 40_000_000 })).toEqual({ ok: true });
  });

  it("limit 0 on a 0-jar passes when CASA is negative (C03)", () => {
    expect(fitsCasaCap([jar("khac", 0)], -1_000_000, { khac: 0 })).toEqual({ ok: true });
  });

  it("raising while over cap is still rejected with the full overBy", () => {
    expect(fitsCasaCap(OVER, 57_600_000, { a: 40_000_001 })).toEqual({ ok: false, overBy: 12_400_001 });
  });

  it("explicit baseline: no-op write passes, an increase past CASA fails", () => {
    expect(fitsCasaCap(OVER, 10_000_000, {}, OVER)).toEqual({ ok: true });
    const raised = [jar("a", 40_000_000), jar("b", 31_000_000)];
    expect(fitsCasaCap(raised, 57_600_000, {}, OVER)).toEqual({ ok: false, overBy: 13_400_000 });
    expect(fitsCasaCap(raised, 71_000_000, {}, OVER)).toEqual({ ok: true });
  });

  it("unknown CASA blocks increases only", () => {
    expect(fitsCasaCap(OVER, "unknown", { a: 1 })).toEqual({ ok: true });
    expect(fitsCasaCap(OVER, "unknown", { a: 40_000_001 })).toEqual({ ok: false });
    expect(fitsCasaCap([jar("x")], "unknown", {}, [jar("x")])).toEqual({ ok: true });
  });
});
