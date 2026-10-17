import { describe, expect, it } from "vitest";
import { aggregateCashflow } from "@/domain/engine/cashflow";
import { generateDataset } from "../fixtures/generate";
import { PERSONAS } from "../personas";

/**
 * Mock-data rule: PFM covers CASA only and every mock spend is paid from CASA, so
 * no persona month may spend more than it took in (Chênh lệch ≥ 0, pending
 * included). Guards persona `salaryBase` against a future tweak that breaks it.
 */
describe("mock personas: monthly spend never exceeds money-in", () => {
  for (const persona of Object.values(PERSONAS)) {
    it(`${persona.cif}: Chênh lệch ≥ 0 every month`, () => {
      const { transactions } = generateDataset(persona);
      const months = [...new Set(transactions.map((t) => t.postedAt.slice(0, 7)))];
      expect(months.length).toBeGreaterThan(0);
      for (const m of months) {
        const [y, mo] = m.split("-").map(Number);
        const from = new Date(Date.UTC(y, mo - 1, 1)).toISOString();
        const to = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999)).toISOString();
        const cf = aggregateCashflow(transactions, { from, to, label: m }, new Set());
        expect(cf.income, `${persona.cif} ${m} has money-in`).toBeGreaterThan(0);
        expect(cf.income - cf.expense - cf.pendingExpense, `${persona.cif} ${m}`).toBeGreaterThanOrEqual(0);
      }
    });
  }
});
