import { describe, expect, it } from "vitest";
import { INVEST_PRODUCTS } from "../../data/products";
import { seriesPointAt, seriesPriceAt } from "../value";
import { investOptions, investSuggestions } from "../invest";
import type { Goal } from "../../model/types";
import type { WorldState } from "../../model/state";

describe("Engine — seriesPointAt & investOptions", () => {
  describe("seriesPointAt", () => {
    it("returns undefined for an empty series; consistent with seriesPriceAt returning 0", () => {
      expect(seriesPointAt([], "2026-10-19")).toBeUndefined();
      expect(seriesPriceAt([], "2026-10-19")).toBe(0);
    });

    it("returns the last point on or before date; falls back to first point if before start; consistent with seriesPriceAt", () => {
      const series = [
        { date: "2026-10-10", price: 100 },
        { date: "2026-10-15", price: 110 },
        { date: "2026-10-20", price: 120 },
      ];

      // Date before the first point -> falls back to first point
      const beforeFirst = seriesPointAt(series, "2026-10-05");
      expect(beforeFirst).toEqual({ date: "2026-10-10", price: 100 });
      expect(seriesPriceAt(series, "2026-10-05")).toBe(beforeFirst?.price);

      // Date matching exact first point
      const exactFirst = seriesPointAt(series, "2026-10-10");
      expect(exactFirst).toEqual({ date: "2026-10-10", price: 100 });
      expect(seriesPriceAt(series, "2026-10-10")).toBe(exactFirst?.price);

      // Date between point 1 and point 2 -> returns point 1
      const mid = seriesPointAt(series, "2026-10-13");
      expect(mid).toEqual({ date: "2026-10-10", price: 100 });
      expect(seriesPriceAt(series, "2026-10-13")).toBe(mid?.price);

      // Date matching point 2
      const exactSecond = seriesPointAt(series, "2026-10-15");
      expect(exactSecond).toEqual({ date: "2026-10-15", price: 110 });
      expect(seriesPriceAt(series, "2026-10-15")).toBe(exactSecond?.price);

      // Date after last point -> returns last point
      const afterLast = seriesPointAt(series, "2026-10-25");
      expect(afterLast).toEqual({ date: "2026-10-20", price: 120 });
      expect(seriesPriceAt(series, "2026-10-25")).toBe(afterLast?.price);
    });
  });

  describe("investOptions", () => {
    const makeWorld = (targetDate: string, today = "2026-10-19") => {
      const goal: Goal = {
        id: "goal-test",
        name: "Mua xe",
        template: "car",
        targetAmount: 500_000_000,
        targetDate,
        createdAt: "2026-01-01",
        flexibility: "date_flexible",
        priority: 1,
        status: "accumulating",
        accountId: "acc-goal",
      };
      const world: Pick<WorldState, "accounts" | "assets" | "clock" | "market" | "customer" | "goals" | "loans"> = {
        clock: { today },
        accounts: [{
          id: "acc-goal",
          goalId: goal.id,
          number: "1234",
          name: "TK mục tiêu – Mua xe",
          balance: 50_000_000,
          interestRatePa: 0.5,
          openedAt: goal.createdAt,
          status: "open",
        }],
        assets: [],
        loans: [],
        goals: [goal],
        customer: {
          cif: "CIF_0001",
          name: "Nguyễn Văn A",
          mainCasaNumber: "123",
          mainCasaBalance: 100_000_000,
          monthlyIncome: 30_000_000,
          monthlyExpenses: 15_000_000,
          monthlySurplus: 15_000_000,
          existingDebtPayment: 0,
          salaryDay: 5,
          riskProfile: "balanced",
          dataMonths: 18,
        },
        market: { fundPriceShiftPct: 0 },
      };
      return { world, goal };
    };

    it("returns one option per INVEST_PRODUCTS entry in catalog order (7 products)", () => {
      const { world, goal } = makeWorld("2028-10-19");
      const options = investOptions(world, goal, 20_000_000);

      expect(options).toHaveLength(7);
      expect(INVEST_PRODUCTS).toHaveLength(7);

      const expectedIds = [
        "msb-m-sinh-loi",
        "msb-special-deposit",
        "msb-online-deposit",
        "msb-savings-flex",
        "msb-periodic-deposit",
        "msb-upfront-deposit",
        "msb-ong-vang",
      ];
      expect(options.map((o) => o.productId)).toEqual(expectedIds);

      const expectedProductNames = [
        "M - Sinh lời",
        "Tiền gửi lãi suất đặc biệt",
        "Tiền gửi lãi suất cao nhất",
        "Tiền gửi rút gốc từng phần",
        "Tiền gửi định kỳ sinh lời",
        "Tiền gửi trả lãi ngay",
        "Tiền gửi gửi góp Ong vàng",
      ];
      options.forEach((opt, idx) => {
        expect(opt.title).toContain(expectedProductNames[idx]);
        expect(opt.suggestedAmount).toBe(20_000_000);
      });
    });

    it("term deposits get the longest term maturing before the goal date, else the shortest", () => {
      // 1. Goal is 10 months away (monthsLeft = 10)
      const { world: w10, goal: g10 } = makeWorld("2027-08-19"); // ~10 months from 2026-10-19
      const opt10 = investOptions(w10, g10, 20_000_000);

      // msb-special-deposit terms: [6, 12, 15, 24] -> longest < 10 is 6
      const special10 = opt10.find((o) => o.productId === "msb-special-deposit");
      expect(special10?.termMonths).toBe(6);

      // msb-online-deposit terms: [1, 3, 6, 12, 24, 36] -> longest < 10 is 6
      const online10 = opt10.find((o) => o.productId === "msb-online-deposit");
      expect(online10?.termMonths).toBe(6);

      // 2. Goal is only 2 months away (monthsLeft = 2)
      const { world: w2, goal: g2 } = makeWorld("2026-12-19"); // 2 months
      const opt2 = investOptions(w2, g2, 20_000_000);

      // msb-special-deposit has no term < 2, so falls back to the shortest (6 months)
      const special2 = opt2.find((o) => o.productId === "msb-special-deposit");
      expect(special2?.termMonths).toBe(6);

      // msb-online-deposit terms [1, 3, 6...] -> longest < 2 is 1 month
      const online2 = opt2.find((o) => o.productId === "msb-online-deposit");
      expect(online2?.termMonths).toBe(1);

      // 3. Goal is 1 month away (monthsLeft = 1) -> no term < 1 for online-deposit, falls back to shortest (1 month)
      const { world: w1, goal: g1 } = makeWorld("2026-11-19"); // 1 month
      const opt1 = investOptions(w1, g1, 20_000_000);
      const online1 = opt1.find((o) => o.productId === "msb-online-deposit");
      expect(online1?.termMonths).toBe(1);
    });

    it("investSuggestions output is unchanged by investOptions", () => {
      const { world, goal } = makeWorld("2028-10-19");
      const suggestionsBefore = investSuggestions(world, goal, 20_000_000);

      // Call investOptions
      investOptions(world, goal, 20_000_000);

      const suggestionsAfter = investSuggestions(world, goal, 20_000_000);
      expect(suggestionsAfter).toEqual(suggestionsBefore);
    });
  });
});
