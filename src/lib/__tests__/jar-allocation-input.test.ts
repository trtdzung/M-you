import { describe, it, expect } from "vitest";
import { sanitizeAllocationInput, sanitizeAllocationInputs } from "@/lib/jar-allocation-input";

describe("sanitizeAllocationInput", () => {
  it("accepts a well-formed allocation", () => {
    expect(sanitizeAllocationInput({ txnId: "t1", jarId: "food", amount: 100 })).toEqual({
      txnId: "t1",
      jarId: "food",
      amount: 100,
    });
  });

  it("drops unknown fields", () => {
    expect(sanitizeAllocationInput({ txnId: "t1", jarId: "food", amount: 100, evil: "x" })).toEqual({
      txnId: "t1",
      jarId: "food",
      amount: 100,
    });
  });

  it.each([
    ["non-object", 42],
    ["null", null],
    ["empty txnId", { txnId: "", jarId: "food", amount: 100 }],
    ["missing jarId", { txnId: "t1", amount: 100 }],
    ["zero amount", { txnId: "t1", jarId: "food", amount: 0 }],
    ["negative amount", { txnId: "t1", jarId: "food", amount: -5 }],
    ["NaN amount", { txnId: "t1", jarId: "food", amount: Number.NaN }],
    ["Infinity amount", { txnId: "t1", jarId: "food", amount: Number.POSITIVE_INFINITY }],
    ["string amount", { txnId: "t1", jarId: "food", amount: "100" }],
  ])("rejects %s", (_label, input) => {
    expect(sanitizeAllocationInput(input)).toBeNull();
  });
});

describe("sanitizeAllocationInputs", () => {
  it("accepts a list of valid allocations", () => {
    const out = sanitizeAllocationInputs([
      { txnId: "t1", jarId: "food", amount: 100 },
      { txnId: "t1", jarId: "bills", amount: 50 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("rejects the whole batch when any element is malformed (no partial write)", () => {
    expect(
      sanitizeAllocationInputs([
        { txnId: "t1", jarId: "food", amount: 100 },
        { txnId: "t1", jarId: "food", amount: -1 },
      ]),
    ).toBeNull();
  });

  it("rejects a non-array or empty list", () => {
    expect(sanitizeAllocationInputs("nope")).toBeNull();
    expect(sanitizeAllocationInputs([])).toBeNull();
  });
});
