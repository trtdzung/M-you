import { describe, expect, it } from "vitest";
import { isCreateJarUi, isEditJarUi, isJarUi, type UiPayload } from "../agent-api";

/**
 * Shape guards for the agent's jar proposals (plan 260923 Phase 05, Decision 5):
 * `create_jar` REQUIRES `initial_balance` (whole VND ≥ 0) — a missing one is
 * rejected, never defaulted to 0 (invariant #6). `allocation_amount` is the limit.
 */

const EXPENSE = new Set(["dining", "groceries"]);

const create = (over: Record<string, unknown> = {}) =>
  ({
    type: "create_jar",
    jar_name: "Du lịch",
    allocation_amount: 2_000_000,
    initial_balance: 1_000_000,
    category_ids: ["dining"],
    reason: "Để dành cho chuyến đi",
    ...over,
  }) as UiPayload;

describe("isCreateJarUi — initial_balance (required, ≥ 0)", () => {
  it("accepts a well-formed payload", () => {
    expect(isCreateJarUi(create(), EXPENSE)).toBe(true);
    expect(isJarUi(create(), EXPENSE)).toBe(true);
  });

  it("accepts 0 as an explicit opening balance", () => {
    expect(isCreateJarUi(create({ initial_balance: 0 }), EXPENSE)).toBe(true);
  });

  it("rejects a payload WITHOUT initial_balance (never defaulted to 0)", () => {
    const { initial_balance: _omit, ...rest } = create() as unknown as Record<string, unknown>;
    expect(isCreateJarUi(rest as UiPayload, EXPENSE)).toBe(false);
    expect(isJarUi(rest as UiPayload, EXPENSE)).toBe(false);
  });

  it.each([
    ["negative", -1],
    ["fractional", 1500.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "1000000"],
    ["null", null],
    ["above the 10^12 ceiling", 1_000_000_000_001],
  ])("rejects %s initial_balance", (_name, value) => {
    expect(isCreateJarUi(create({ initial_balance: value }), EXPENSE)).toBe(false);
  });

  it("still rejects a payload carrying a jar_id or a non-positive limit", () => {
    expect(isCreateJarUi(create({ jar_id: "x" }), EXPENSE)).toBe(false);
    expect(isCreateJarUi(create({ allocation_amount: 0 }), EXPENSE)).toBe(false);
  });

  it("rejects an unknown category id", () => {
    expect(isCreateJarUi(create({ category_ids: ["not-a-category"] }), EXPENSE)).toBe(false);
  });
});

describe("isEditJarUi — limit only, no balance field required", () => {
  it("accepts an edit without initial_balance", () => {
    const edit = { type: "edit_jar", jar_id: "food", jar_name: "Ăn uống", allocation_amount: 5_000_000, reason: "Tăng hạn mức" } as UiPayload;
    expect(isEditJarUi(edit, EXPENSE)).toBe(true);
  });
});
