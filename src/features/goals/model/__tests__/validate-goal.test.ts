import { describe, expect, it } from "vitest";
import { MAX_VND } from "@/domain/models/asset-liability-input";
import { validateGoalCreate, validateGoalUpdate } from "../validate-goal";

const NOW = new Date("2026-09-15T00:00:00.000Z");
const ok = {
  name: "Mua nhà",
  targetAmount: 600_000_000,
  targetDate: "2029-09-15",
  flexibility: "flexible",
};

describe("validateGoalCreate", () => {
  it("accepts a minimal valid input and defaults optional fields to null", () => {
    const r = validateGoalCreate(ok, NOW);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      name: "Mua nhà",
      monthlyContribution: null,
      openingAmount: null,
    });
  });

  it("trims the name and enforces 1-80 chars", () => {
    expect(validateGoalCreate({ ...ok, name: "  x  " }, NOW).value?.name).toBe("x");
    expect(validateGoalCreate({ ...ok, name: "a".repeat(80) }, NOW).ok).toBe(true);
    expect(validateGoalCreate({ ...ok, name: "a".repeat(81) }, NOW).errors.name).toBeDefined();
    expect(validateGoalCreate({ ...ok, name: "   " }, NOW).errors.name).toBeDefined();
    expect(validateGoalCreate({ ...ok, name: 5 }, NOW).errors.name).toBeDefined();
  });

  it.each([0, -1, 1.5, Number.NaN, "100", MAX_VND + 1, null, undefined])(
    "rejects targetAmount %s",
    (v) => {
      expect(validateGoalCreate({ ...ok, targetAmount: v }, NOW).errors.targetAmount).toBeDefined();
    },
  );
  it("accepts targetAmount = MAX_VND", () => {
    expect(validateGoalCreate({ ...ok, targetAmount: MAX_VND }, NOW).ok).toBe(true);
  });

  it.each(["2026-09-14", "2026-09-15", "15/09/2029", "2029-02-30", "", 20290915, null])(
    "rejects targetDate %s",
    (v) => {
      expect(validateGoalCreate({ ...ok, targetDate: v }, NOW).errors.targetDate).toBeDefined();
    },
  );
  it("accepts the day after today", () => {
    expect(validateGoalCreate({ ...ok, targetDate: "2026-09-16" }, NOW).ok).toBe(true);
  });

  it("rejects bad flexibility", () => {
    expect(validateGoalCreate({ ...ok, flexibility: "x" }, NOW).errors.flexibility).toBeDefined();
  });

  it("monthlyContribution: null/0 ok, negative/fraction/string rejected", () => {
    expect(validateGoalCreate({ ...ok, monthlyContribution: 0 }, NOW).value?.monthlyContribution).toBe(0);
    expect(validateGoalCreate({ ...ok, monthlyContribution: null }, NOW).ok).toBe(true);
    for (const v of [-1, 1.2, "5", Number.NaN]) {
      expect(
        validateGoalCreate({ ...ok, monthlyContribution: v }, NOW).errors.monthlyContribution,
      ).toBeDefined();
    }
  });

  it("openingAmount must be < targetAmount", () => {
    expect(validateGoalCreate({ ...ok, openingAmount: 599_999_999 }, NOW).ok).toBe(true);
    expect(validateGoalCreate({ ...ok, openingAmount: 0 }, NOW).ok).toBe(true);
    for (const v of [600_000_000, 700_000_000]) {
      expect(validateGoalCreate({ ...ok, openingAmount: v }, NOW).errors.openingAmount).toBe(
        "Số đã có phải nhỏ hơn số tiền mục tiêu",
      );
    }
    expect(validateGoalCreate({ ...ok, openingAmount: -5 }, NOW).errors.openingAmount).toBeDefined();
  });

  it("non-object input yields errors for required fields", () => {
    const r = validateGoalCreate(null, NOW);
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(
      expect.arrayContaining(["name", "targetAmount", "targetDate", "flexibility"]),
    );
  });
});

describe("validateGoalUpdate", () => {
  it("allows missing fields and returns only those present", () => {
    const r = validateGoalUpdate({ name: " Xe " }, NOW);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ name: "Xe" });
    expect(validateGoalUpdate({}, NOW).value).toEqual({});
  });

  it("validates present fields", () => {
    expect(validateGoalUpdate({ targetDate: "2020-01-01" }, NOW).errors.targetDate).toBeDefined();
    expect(validateGoalUpdate({ targetAmount: 0 }, NOW).errors.targetAmount).toBeDefined();
    expect(validateGoalUpdate({ monthlyContribution: null }, NOW).value).toEqual({
      monthlyContribution: null,
    });
  });

  it("validates status", () => {
    expect(validateGoalUpdate({ status: "paused" }, NOW).value).toEqual({ status: "paused" });
    expect(validateGoalUpdate({ status: "active" }, NOW).value).toEqual({ status: "active" });
    expect(validateGoalUpdate({ status: "archived" }, NOW).value).toEqual({ status: "archived" });
    expect(validateGoalUpdate({ status: "done" }, NOW).errors.status).toBe("Trạng thái không hợp lệ");
    expect(validateGoalUpdate({ status: 1 }, NOW).errors.status).toBeDefined();
  });

  it("rejects a bad flexibility and an oversized monthly contribution", () => {
    expect(validateGoalUpdate({ flexibility: "loose" }, NOW).errors.flexibility).toBeDefined();
    expect(
      validateGoalUpdate({ monthlyContribution: MAX_VND + 1 }, NOW).errors.monthlyContribution,
    ).toBeDefined();
  });
});
