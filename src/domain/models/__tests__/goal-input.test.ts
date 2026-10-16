import { describe, expect, it } from "vitest";
import {
  isValidGoalRecord,
  validateGoalInput,
  type GoalDraft,
} from "../goal-input";

const draft = (over: Partial<GoalDraft> = {}): GoalDraft => ({
  name: "Mua nhà",
  targetAmount: "500000000",
  targetDate: "2028-01-01",
  monthlyContribution: "5000000",
  ...over,
});

describe("validateGoalInput — the sole gate to the model", () => {
  it("accepts a well-formed goal and strips optional blanks to null", () => {
    const r = validateGoalInput(draft({ targetDate: "", monthlyContribution: "" }));
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      name: "Mua nhà",
      targetAmount: 500_000_000,
      targetDate: null,
      monthlyContribution: null,
    });
  });

  it("rejects a blank name", () => {
    expect(validateGoalInput(draft({ name: "  " })).ok).toBe(false);
  });

  it("rejects a blank / NaN / negative / zero target amount (never 0-defaults)", () => {
    expect(validateGoalInput(draft({ targetAmount: "" })).errors.targetAmount).toBeTruthy();
    expect(validateGoalInput(draft({ targetAmount: "abc" })).errors.targetAmount).toBeTruthy();
    expect(validateGoalInput(draft({ targetAmount: "-100" })).errors.targetAmount).toBeTruthy();
    expect(validateGoalInput(draft({ targetAmount: "0" })).errors.targetAmount).toBeTruthy();
  });

  it("rejects an invalid date but allows an empty one", () => {
    expect(validateGoalInput(draft({ targetDate: "not-a-date" })).errors.targetDate).toBeTruthy();
    expect(validateGoalInput(draft({ targetDate: "" })).ok).toBe(true);
  });

  it("rejects a negative monthly contribution", () => {
    expect(validateGoalInput(draft({ monthlyContribution: "-5" })).errors.monthlyContribution).toBeTruthy();
  });
});

describe("isValidGoalRecord — per-record storage guard", () => {
  const good = {
    id: "g1",
    name: "Quỹ",
    targetAmount: 10_000_000,
    currentAmount: 0,
    targetDate: null,
    source: "self_reported",
    monthlyContribution: null,
  };

  it("passes a well-formed record", () => {
    expect(isValidGoalRecord(good)).toBe(true);
  });

  it("drops records with a missing id, bad amount, or foreign source", () => {
    expect(isValidGoalRecord({ ...good, id: "" })).toBe(false);
    expect(isValidGoalRecord({ ...good, targetAmount: -1 })).toBe(false);
    expect(isValidGoalRecord({ ...good, targetAmount: Number.NaN })).toBe(false);
    expect(isValidGoalRecord({ ...good, source: "bank" })).toBe(false);
    expect(isValidGoalRecord({ id: "x" })).toBe(false);
    expect(isValidGoalRecord(null)).toBe(false);
  });
});
