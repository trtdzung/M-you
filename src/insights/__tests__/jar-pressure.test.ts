import { describe, expect, it } from "vitest";
import type { JarLine } from "@/domain/engine";
import { currentMonthKey } from "@/lib/demo-clock";
import { jarPressure } from "../detectors/jar-pressure";
import { numbersIn, factValues } from "../narrate";
import type { Insight } from "../types";
import { makeFinancials } from "./helpers";

const THIS_MONTH = currentMonthKey();

function jarLine(over: Partial<JarLine>): JarLine {
  return {
    jarId: "lifestyle",
    label: "Giải trí",
    categoryIds: ["entertainment"],
    allocated: 2_000_000,
    used: 1_000_000,
    pct: 0.5,
    daysLeft: 12,
    status: "ok",
    perCategory: [],
    meta: { source: "mock", freshness: null },
    ...over,
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

describe("jarPressure detector", () => {
  it("flags an over jar as urgent and stays grounded", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarLines: [jarLine({ used: 2_400_000, pct: 1.2, status: "over" })],
      }),
    );
    expect(insight?.severity).toBe("urgent");
    expect(insight?.type).toBe("jar_pressure");
    assertGrounded(insight!);
  });

  it("prefers an over jar over a near one", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarLines: [
          jarLine({ jarId: "near", label: "Ăn uống", used: 1_800_000, pct: 0.9, status: "near" }),
          jarLine({ jarId: "over", label: "Giải trí", used: 2_400_000, pct: 1.2, status: "over" }),
        ],
      }),
    );
    expect(insight?.severity).toBe("urgent");
    expect(insight?.title).toContain("Giải trí");
  });

  it("flags a near jar as attention when nothing is over", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarLines: [jarLine({ used: 1_800_000, pct: 0.9, status: "near" })],
      }),
    );
    expect(insight?.severity).toBe("attention");
  });

  it("[C1] skips unknown-income and unassigned jars", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarLines: [
          jarLine({ jarId: "unknown", allocated: null, pct: null, status: "unknown" }),
          jarLine({ jarId: "unassigned", label: "Chưa phân hũ", allocated: null, pct: null, status: "unknown", isUnassigned: true }),
        ],
      }),
    );
    expect(insight).toBeNull();
  });

  it("[H2] returns null off the current month (no stale urgency)", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: "2026-06", // a closed past period
        jarLines: [jarLine({ used: 2_400_000, pct: 1.2, status: "over" })],
      }),
    );
    expect(insight).toBeNull();
  });

  it("includes the days-left figure on the current month", () => {
    const insight = jarPressure(
      makeFinancials({
        monthKey: THIS_MONTH,
        jarLines: [jarLine({ used: 2_400_000, pct: 1.2, status: "over", daysLeft: 8 })],
      }),
    );
    expect(insight?.explanation).toContain("còn 8 ngày");
  });

  it("returns null when no jar is under pressure", () => {
    expect(jarPressure(makeFinancials({ monthKey: THIS_MONTH, jarLines: [jarLine({})] }))).toBeNull();
  });
});
