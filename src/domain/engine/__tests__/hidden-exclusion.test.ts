import { describe, expect, it } from "vitest";
import type { JarConfig } from "@/domain/models";
import { netExpenseByCategory } from "../cashflow";
import { evaluateJarBudget } from "../jar-budget";
import { monthPeriod } from "../types";
import { isHidden, type Corrections } from "@/state/corrections";
import { txn } from "./helpers";

/**
 * The M1 corrections seam: hiding a transaction from reports is an override that
 * DROPS the row from the array the engine sees (like reversed/pending), never a
 * mutation of the provider record (invariant #4/#6). These tests pin the two
 * rules that matter: a hidden posted expense stops counting, and hiding an
 * already-excluded row (reversed/pending) is a no-op — no double subtraction.
 */
const JUNE = monthPeriod(2026, 5);
const MAY = monthPeriod(2026, 4);
const NOW = new Date("2026-06-20T00:00:00.000Z");

const config: JarConfig = {
  version: 3,
  jars: [{ id: "food", label: "Ăn uống", categoryIds: ["dining"], budgetLimit: 4_000_000 }],
};

/** How `useFinancials` derives the engine array: drop hidden rows. */
const engineView = (txns: ReturnType<typeof txn>[], corrections: Corrections) =>
  txns.filter((t) => !isHidden(corrections, t.id));

describe("hidden correction — spend exclusion", () => {
  it("drops a hidden posted expense from net expense", () => {
    const txns = [
      txn({ id: "a", categoryId: "dining", amount: 300_000 }),
      txn({ id: "b", categoryId: "dining", amount: 200_000 }),
    ];
    const corrections: Corrections = { b: { hidden: true } };
    const visible = engineView(txns, corrections);
    const byCat = netExpenseByCategory(visible, JUNE);
    expect(byCat.get("dining")).toBe(300_000); // only "a" counts
  });

  it("drops the hidden jar's spend from evaluateJarBudget", () => {
    const txns = [
      txn({ id: "a", categoryId: "dining", amount: 1_000_000 }),
      txn({ id: "b", categoryId: "dining", amount: 1_500_000 }),
    ];
    const full = evaluateJarBudget(config, txns, JUNE, MAY, NOW);
    expect(full.lines[0].spent).toBe(2_500_000);

    const visible = engineView(txns, { a: { hidden: true } });
    const hidden = evaluateJarBudget(config, visible, JUNE, MAY, NOW);
    expect(hidden.lines[0].spent).toBe(1_500_000); // "a" excluded, no phantom 0
  });

  it("hiding an already-excluded reversed txn is a no-op (no double count)", () => {
    const txns = [
      txn({ id: "posted", categoryId: "dining", amount: 400_000, status: "posted" }),
      txn({ id: "rev", categoryId: "dining", amount: 999_000, status: "reversed" }),
    ];
    // Reversed never counts to begin with.
    expect(netExpenseByCategory(txns, JUNE).get("dining")).toBe(400_000);

    // Hiding the reversed one changes nothing — it was already out.
    const visible = engineView(txns, { rev: { hidden: true } });
    expect(netExpenseByCategory(visible, JUNE).get("dining")).toBe(400_000);
  });

  it("a hidden pending txn stays out with no negative side effect", () => {
    const txns = [
      txn({ id: "posted", categoryId: "dining", amount: 500_000, status: "posted" }),
      txn({ id: "pend", categoryId: "dining", amount: 700_000, status: "pending" }),
    ];
    const visible = engineView(txns, { pend: { hidden: true } });
    expect(netExpenseByCategory(visible, JUNE).get("dining")).toBe(500_000);
  });
});
