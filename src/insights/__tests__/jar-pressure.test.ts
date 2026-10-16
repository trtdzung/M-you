import { describe, expect, it } from "vitest";
import type { JarPartitionLine, JarPartitionResult } from "@/domain/engine";
import { currentMonthKey } from "@/lib/demo-clock";
import { jarPressure } from "../detectors/jar-pressure";
import { numbersIn, factValues } from "../narrate";
import type { Insight } from "../types";
import { makeFinancials } from "./helpers";

const THIS_MONTH = currentMonthKey();

function jarLine(over: Partial<JarPartitionLine>): JarPartitionLine {
  return {
    jarId: "food",
    label: "Ăn uống",
    categoryIds: ["dining"],
    earmark: 3_000_000,
    spentThisPeriod: 1_000_000,
    spentPrevPeriod: 900_000,
    isOverBudget: false,
    perCategory: [],
    meta: { source: "mock", freshness: null },
    ...over,
  };
}

function residualLine(over: Partial<JarPartitionLine>): JarPartitionLine {
  return {
    jarId: "unallocated",
    label: "Chưa phân bổ",
    categoryIds: [],
    earmark: 2_000_000,
    spentThisPeriod: 0,
    spentPrevPeriod: 0,
    isOverBudget: false,
    perCategory: [],
    meta: { source: "msb", freshness: null },
    isResidual: true,
    isOverAllocated: false,
    ...over,
  };
}

function partition(lines: JarPartitionLine[], status: JarPartitionResult["status"] = "ok"): JarPartitionResult {
  return {
    status,
    primaryBalance: status === "ok" ? 10_000_000 : null,
    lines,
    total: 10_000_000,
    meta: { source: "msb", freshness: null },
  };
}

/** Money-scale numbers (>=1000, non-year) in the explanation must be grounded. */
function assertGrounded(insight: Insight) {
  const facts = factValues(insight);
  for (const n of numbersIn(insight.explanation)) {
    const isYear = n >= 1900 && n <= 2100;
    if (n >= 1000 && !isYear) expect(facts, `${n} not grounded`).toContain(n);
  }
}

describe("jarPressure detector (Model A — over-budget / over-allocated)", () => {
  it("flags an over-budget jar as attention and stays grounded", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarPartition: partition([
          jarLine({ spentThisPeriod: 4_000_000, earmark: 3_000_000, isOverBudget: true }),
          residualLine({}),
        ]),
      }),
    );
    expect(insight?.severity).toBe("attention");
    expect(insight?.type).toBe("jar_pressure");
    expect(insight?.title).toContain("Ăn uống");
    assertGrounded(insight!);
  });

  it("prioritises an over-allocated residual (urgent) over an over-budget jar", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarPartition: partition([
          jarLine({ spentThisPeriod: 4_000_000, earmark: 3_000_000, isOverBudget: true }),
          residualLine({ earmark: -2_000_000, isOverAllocated: true }),
        ]),
      }),
    );
    expect(insight?.severity).toBe("urgent");
    expect(insight?.title).toContain("vượt số dư");
    assertGrounded(insight!);
  });

  it("picks the largest breach when several jars are over budget", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarPartition: partition([
          jarLine({ jarId: "small", label: "Nhỏ", spentThisPeriod: 1_100_000, earmark: 1_000_000, isOverBudget: true }),
          jarLine({ jarId: "big", label: "Lớn", spentThisPeriod: 5_000_000, earmark: 2_000_000, isOverBudget: true }),
          residualLine({}),
        ]),
      }),
    );
    expect(insight?.title).toContain("Lớn");
  });

  it("returns null when nothing is over budget or over allocated", () => {
    expect(
      jarPressure(makeFinancials({ monthKey: THIS_MONTH, jarPartition: partition([jarLine({}), residualLine({})]) })),
    ).toBeNull();
  });

  it("[H2] returns null off the current month (no stale warning)", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: "2026-06",
        jarPartition: partition([jarLine({ spentThisPeriod: 4_000_000, earmark: 3_000_000, isOverBudget: true }), residualLine({})]),
      }),
    );
    expect(insight).toBeNull();
  });

  it("returns null when the partition is unknown (ambiguous primary account)", () => {
    expect(
      jarPressure(makeFinancials({ monthKey: THIS_MONTH, jarPartition: partition([], "unknown") })),
    ).toBeNull();
  });
});
