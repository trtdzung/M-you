import { describe, it, expect } from "vitest";
import { fitsCasaCap } from "../allocation-plan";

/**
 * `fitsCasaCap(nextSpendable, baseSpendable, casaPool)` — the pure S5 accept/reject
 * rule over BALANCE-lens totals (`Σ spendable`). The caller derives the two totals
 * from `evaluateJarEnvelope`, so these tests exercise only the rule, not spend.
 */
describe("fitsCasaCap — balance lens (Σ spendable ≤ CASA)", () => {
  it("Σ spendable exactly equal to CASA (an increase) → ok", () => {
    expect(fitsCasaCap(12_000_000, 0, 12_000_000)).toEqual({ ok: true });
  });

  it("increase over CASA by 1 VND → fail with overBy", () => {
    expect(fitsCasaCap(12_000_001, 0, 12_000_000)).toEqual({ ok: false, overBy: 1 });
  });

  it("increase within CASA → ok", () => {
    expect(fitsCasaCap(10_000_000, 6_000_000, 12_000_000)).toEqual({ ok: true });
  });

  it("pool unknown → any increase blocked (ok:false, no overBy)", () => {
    expect(fitsCasaCap(1, 0, "unknown")).toEqual({ ok: false });
  });

  it("no change (next == base) → ok even when pool unknown", () => {
    expect(fitsCasaCap(5_000_000, 5_000_000, "unknown")).toEqual({ ok: true });
  });

  it("empty everything → ok trivially", () => {
    expect(fitsCasaCap(0, 0, 0)).toEqual({ ok: true });
  });
});

describe("fitsCasaCap — only an INCREASE of Σ spendable can be rejected (S5)", () => {
  it("lowering Σ spendable on an already-over-cap config passes even if still over (A34)", () => {
    // base 70tr, next 65tr, CASA 57,6tr — lowered, still over, but allowed.
    expect(fitsCasaCap(65_000_000, 70_000_000, 57_600_000)).toEqual({ ok: true });
  });

  it("re-saving the same total passes when CASA dropped below Σ (C08)", () => {
    expect(fitsCasaCap(70_000_000, 70_000_000, 52_600_000)).toEqual({ ok: true });
  });

  it("Σ spendable 0 passes when CASA is negative (C03)", () => {
    expect(fitsCasaCap(0, 0, -1_000_000)).toEqual({ ok: true });
  });

  it("raising while over cap is rejected with the full overBy", () => {
    // base 70tr, next 70,000,001, CASA 57,6tr → over by 12,400,001.
    expect(fitsCasaCap(70_000_001, 70_000_000, 57_600_000)).toEqual({ ok: false, overBy: 12_400_001 });
  });

  it("an increase that lands exactly on CASA is accepted", () => {
    expect(fitsCasaCap(57_600_000, 40_000_000, 57_600_000)).toEqual({ ok: true });
  });

  it("unknown CASA blocks increases only", () => {
    expect(fitsCasaCap(40_000_001, 40_000_000, "unknown")).toEqual({ ok: false });
    expect(fitsCasaCap(39_000_000, 40_000_000, "unknown")).toEqual({ ok: true });
  });
});
