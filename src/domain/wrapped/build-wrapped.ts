/**
 * Assemble the deck. Pure: same input -> same deck, no clock reads (the caller
 * passes `endMonthKey`). An insufficient window yields NO slides — never a deck
 * padded with zeros (invariant #6).
 */

import { archetypeSlide } from "./archetype";
import { closingSlide } from "./facts-closing";
import { habitsSlide } from "./facts-habits";
import { healthSlide } from "./facts-health";
import { topMerchantsSlide } from "./facts-merchants";
import { recurringSlide } from "./facts-recurring";
import { jarShareSlide, totalSpendSlide } from "./facts-spend";
import { makeFact, provenanceOf } from "./wrapped-fact";
import { wrappedCoverage } from "./wrapped-coverage";
import { wrappedMonthKeys, wrappedPeriod } from "./wrapped-period";
import { countedRows } from "./wrapped-txn-rules";
import {
  WRAPPED_SLIDE_ORDER,
  type WrappedContext,
  type WrappedDeck,
  type WrappedInput,
  type WrappedSlide,
  type WrappedSlideId,
} from "./wrapped-types";

function openingSlide(ctx: WrappedContext): WrappedSlide {
  const provenance = provenanceOf(countedRows(ctx.input.transactions, ctx.period).map((r) => r.txn));
  const { monthsWithData, monthsTotal, countedExpenseCount } = ctx.coverage;
  return {
    id: "opening",
    available: true,
    facts: [
      makeFact(
        "months-with-data",
        monthsWithData,
        "count",
        ctx.period,
        provenance,
        `${monthsWithData}/${monthsTotal} tháng có dữ liệu chi tiêu`,
      ),
      makeFact("counted-expense-count", countedExpenseCount, "count", ctx.period, provenance),
    ],
  };
}

export function buildWrapped(input: WrappedInput): WrappedDeck {
  const monthKeys = wrappedMonthKeys(input.endMonthKey);
  const period = wrappedPeriod(monthKeys);
  const coverage = wrappedCoverage(input.transactions, input.endMonthKey);
  if (!coverage.sufficient) return { period, coverage, slides: [] };

  const ctx: WrappedContext = { input, monthKeys, period, coverage };
  const builders: Record<Exclude<WrappedSlideId, "archetype">, () => WrappedSlide> = {
    opening: () => openingSlide(ctx),
    "total-spend": () => totalSpendSlide(ctx),
    "jar-share": () => jarShareSlide(ctx),
    "top-merchants": () => topMerchantsSlide(ctx),
    habits: () => habitsSlide(ctx),
    recurring: () => recurringSlide(ctx),
    health: () => healthSlide(input.healthScore),
    closing: () => closingSlide(ctx),
  };
  // Built in deck order; the archetype reads the facts of the slides before it.
  const built: WrappedSlide[] = [];
  for (const id of WRAPPED_SLIDE_ORDER) {
    built.push(id === "archetype" ? archetypeSlide(period, built) : builders[id]());
  }
  return { period, coverage, slides: built.filter((s) => s.available) };
}
