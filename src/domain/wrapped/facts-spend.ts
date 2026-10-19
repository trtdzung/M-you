/**
 * Spend slides: total spend by month (with gaps), where it went by jar, and the
 * fixed share. Every number is an engine aggregate (`aggregateCashflow`,
 * `groupSpendingByJar`) — nothing is recomputed here.
 */

import { aggregateCashflow, netExpenseByCategory } from "@/domain/engine/cashflow";
import { groupSpendingByJar } from "@/domain/engine/category-jars";
import { provenanceByCategory } from "@/domain/engine/jar-budget-provenance";
import { lowestTrust } from "@/domain/engine/provenance";
import { monthPeriodFromKey } from "@/domain/engine/types";
import type { DataSource } from "@/domain/models";
import { latestOf, makeFact, pctOf, provenanceOf, type FactProvenance } from "./wrapped-fact";
import { sanitizeLabel } from "./sanitize-label";
import { countedRows, isPersonCounterparty, monthHasExpenseData } from "./wrapped-txn-rules";
import { WRAPPED_MONTHS } from "./wrapped-thresholds";
import type { WrappedContext, WrappedFact, WrappedSlide } from "./wrapped-types";

/** `total-spend` + one `month-spend.<YYYY-MM>` fact per KNOWN month; unknown months are series gaps. */
export function totalSpendSlide(ctx: WrappedContext): WrappedSlide {
  const { transactions, fixedCategoryIds } = ctx.input;
  const series: (number | "unknown")[] = [];
  const monthFacts: WrappedFact[] = [];

  for (const key of ctx.monthKeys) {
    if (!monthHasExpenseData(transactions, key)) {
      series.push("unknown");
      continue;
    }
    const period = monthPeriodFromKey(key);
    const { expense, meta } = aggregateCashflow(transactions, period, fixedCategoryIds);
    series.push(expense);
    const provenance: FactProvenance = {
      source: lowestTrust(meta.sourceCoverage.sources),
      freshness: meta.freshness,
    };
    monthFacts.push(makeFact(`month-spend.${key}`, expense, "vnd", period, provenance));
  }

  if (monthFacts.length === 0) return { id: "total-spend", available: false, facts: [] };

  const total = monthFacts.reduce((sum, f) => sum + (f.value as number), 0);
  const provenance: FactProvenance = {
    source: lowestTrust(monthFacts.map((f) => f.source)),
    freshness: latestOf(monthFacts.map((f) => f.freshness)),
  };
  const missing = WRAPPED_MONTHS - monthFacts.length;
  const assumption =
    missing > 0
      ? `Tổng của ${monthFacts.length}/${WRAPPED_MONTHS} tháng có dữ liệu; tháng thiếu dữ liệu không được tính là 0`
      : undefined;
  return {
    id: "total-spend",
    available: true,
    facts: [makeFact("total-spend", total, "vnd", ctx.period, provenance, assumption), ...monthFacts],
    series,
  };
}

/**
 * Spend by jar (`jar.<rank>.{label,amount,share}`, amount-desc, incl. "Chưa xếp hũ" /
 * "Chưa phân loại") plus `fixed-share` of the window's spend, and the same share over
 * non-person rows (`fixed-share-excl-person`, archetype input only).
 */
export function jarShareSlide(ctx: WrappedContext): WrappedSlide {
  const { transactions, jarConfig, categoryLabels, fixedCategoryIds } = ctx.input;
  const groups = groupSpendingByJar(jarConfig, transactions, ctx.period, categoryLabels);
  if (groups.length === 0) return { id: "jar-share", available: false, facts: [] };

  const byCategory = provenanceByCategory(transactions, ctx.period);
  const facts: WrappedFact[] = [];
  groups.forEach((group, i) => {
    const sources: DataSource[] = [];
    const latest: (string | null)[] = [];
    for (const c of group.categories) {
      const entry = byCategory.get(c.categoryId);
      if (!entry) continue;
      sources.push(...entry.sources);
      latest.push(entry.latest);
    }
    const provenance: FactProvenance = { source: lowestTrust(sources), freshness: latestOf(latest) };
    const rank = i + 1;
    facts.push(
      makeFact(`jar.${rank}.label`, sanitizeLabel(group.label), "text", ctx.period, provenance),
      makeFact(`jar.${rank}.amount`, group.amount, "vnd", ctx.period, provenance),
      makeFact(`jar.${rank}.share`, group.share * 100, "pct", ctx.period, provenance),
    );
  });

  const { expense, fixed, meta } = aggregateCashflow(transactions, ctx.period, fixedCategoryIds);
  facts.push(
    makeFact(
      "fixed-share",
      pctOf(fixed, expense),
      "pct",
      ctx.period,
      { source: lowestTrust(meta.sourceCoverage.sources), freshness: meta.freshness },
      "Chi cố định theo các danh mục bạn đã đánh dấu là cố định",
    ),
  );
  // Same engine rule (net expense by category) over rows that are not a person counterparty.
  let merchantTotal = 0;
  let merchantFixed = 0;
  const merchantTxns = transactions.filter((t) => !isPersonCounterparty(t));
  for (const [categoryId, amount] of netExpenseByCategory(merchantTxns, ctx.period)) {
    merchantTotal += amount;
    if (fixedCategoryIds.has(categoryId)) merchantFixed += amount;
  }
  // Provenance follows the rows this share is actually built from (person rows excluded).
  const merchantProvenance = provenanceOf(countedRows(merchantTxns, ctx.period).map((r) => r.txn));
  facts.push(
    makeFact(
      "fixed-share-excl-person",
      pctOf(merchantFixed, merchantTotal),
      "pct",
      ctx.period,
      merchantProvenance,
      "Chi cố định theo các danh mục bạn đã đánh dấu là cố định; không gồm chuyển khoản cho cá nhân",
    ),
  );
  return { id: "jar-share", available: true, facts };
}
