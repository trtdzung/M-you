/**
 * Recurring spend, annualized. `detectRecurring` is used for GROUPING only: it flags
 * any merchant seen in >= 3 months (so a frequent taxi app is a "series") and its
 * `averageAmount` is per OCCURRENCE — neither is usable as-is. A series must be
 * monthly-cadence AND (a fixed category OR near-constant amounts), and the annual
 * figure is the window's actual counted spend (net of refunds) scaled to 12 months.
 */

import { inPeriod } from "@/domain/engine/cashflow";
import { detectRecurring } from "@/domain/engine/recurring";
import { categoryLabel } from "@/domain/models";
import { makeFact, provenanceOf } from "./wrapped-fact";
import { sanitizeLabel } from "./sanitize-label";
import { countedRows, isPersonCounterparty, type CountedRow } from "./wrapped-txn-rules";
import { MIN_MONTHS, RECURRING_AMOUNT_SPREAD, RECURRING_MAX_ITEMS } from "./wrapped-thresholds";
import type { WrappedContext, WrappedFact, WrappedSlide } from "./wrapped-types";

interface RecurringItem {
  label: string;
  category: string;
  annual: number;
  rows: CountedRow[];
}

/** (max − min) / mean of the series' expense amounts; 0 for a single amount. */
function amountSpread(amounts: number[]): number {
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return mean > 0 ? (Math.max(...amounts) - Math.min(...amounts)) / mean : Infinity;
}

function recurringItems(ctx: WrappedContext): RecurringItem[] {
  const { transactions, categoryLabels, fixedCategoryIds } = ctx.input;
  const months = ctx.coverage.monthsWithData;
  if (months === 0) return [];

  // Person counterparties never form a series: their "merchant" is a recipient's name.
  const windowTxns = transactions.filter((t) => inPeriod(t, ctx.period) && !isPersonCounterparty(t));
  const counted = countedRows(windowTxns, ctx.period);
  const items: RecurringItem[] = [];

  for (const s of detectRecurring(windowTxns)) {
    if (!s.isExpense || s.distinctMonths < MIN_MONTHS || s.occurrences > s.distinctMonths + 1) continue;
    // An unknown merchant is not a nameable recurring item (same rule as facts-merchants).
    const label = sanitizeLabel(s.label) || sanitizeLabel(s.merchantNormalizedName);
    if (!label) continue;
    // Every counted row of the merchant, refunds (negative contribution) included, so
    // the annual figure nets out exactly like the merchant's spend in top-merchants.
    const rows = counted.filter((r) => r.txn.merchantNormalizedName === s.merchantNormalizedName);
    // Cadence/steadiness look at the charges only.
    const amounts = rows.filter((r) => r.contribution > 0).map((r) => r.contribution);
    if (amounts.length === 0) continue;
    const steady = fixedCategoryIds.has(s.categoryId) || amountSpread(amounts) <= RECURRING_AMOUNT_SPREAD;
    if (!steady) continue;

    const windowSpend = rows.reduce((sum, r) => sum + r.contribution, 0);
    items.push({
      label,
      category: sanitizeLabel(categoryLabel(s.categoryId, categoryLabels)),
      annual: Math.round((windowSpend / months) * 12),
      rows,
    });
  }
  return items.sort((a, b) => b.annual - a.annual || a.label.localeCompare(b.label));
}

export function recurringSlide(ctx: WrappedContext): WrappedSlide {
  const items = recurringItems(ctx);
  if (items.length === 0) return { id: "recurring", available: false, facts: [] };

  const n = ctx.coverage.monthsWithData;
  const assumption = `Ước tính = tổng ${n} tháng có dữ liệu / ${n} x 12`;
  const all = provenanceOf(items.flatMap((i) => i.rows.map((r) => r.txn)));
  const total = items.reduce((sum, i) => sum + i.annual, 0);

  const facts: WrappedFact[] = [makeFact("recurring-total-annual", total, "vnd", ctx.period, all, assumption)];
  items.slice(0, RECURRING_MAX_ITEMS).forEach((item, i) => {
    const provenance = provenanceOf(item.rows.map((r) => r.txn));
    const rank = i + 1;
    facts.push(
      makeFact(`recurring.${rank}.label`, item.label, "text", ctx.period, provenance),
      makeFact(`recurring.${rank}.category`, item.category, "text", ctx.period, provenance),
      makeFact(`recurring.${rank}.annual`, item.annual, "vnd", ctx.period, provenance, assumption),
    );
  });
  return { id: "recurring", available: true, facts };
}
