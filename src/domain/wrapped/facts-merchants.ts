/**
 * Top merchants — DISCRETIONARY spend only (fixed categories such as rent would
 * dominate every ranking), ranked by VISIT COUNT. Person counterparties are never
 * a merchant. Merchant names are the only per-row text in the deck, so they are
 * sanitized here.
 */

import type { Transaction } from "@/domain/models";
import { makeFact, pctOf, provenanceOf } from "./wrapped-fact";
import { sanitizeLabel } from "./sanitize-label";
import { countedRows, isDiscretionary, isPersonCounterparty, type CountedRow } from "./wrapped-txn-rules";
import { TOP_MERCHANTS } from "./wrapped-thresholds";
import type { WrappedContext, WrappedFact, WrappedSlide } from "./wrapped-types";

interface MerchantGroup {
  label: string;
  visits: number;
  net: number;
  rows: Transaction[];
}

function groupMerchants(rows: CountedRow[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup & { latestVisitAt: number }>();
  for (const { txn, contribution } of rows) {
    const key = sanitizeLabel(txn.merchantNormalizedName);
    if (key === "") continue;
    const group = groups.get(key) ?? { label: "", visits: 0, net: 0, rows: [], latestVisitAt: -Infinity };
    group.net += contribution;
    group.rows.push(txn);
    if (contribution > 0) {
      group.visits += 1;
      // Label from the latest VISIT, so a refund row ("Hoàn tiền …") never names the merchant.
      const at = Date.parse(txn.postedAt);
      if (at >= group.latestVisitAt) {
        group.latestVisitAt = at;
        group.label = sanitizeLabel(txn.merchantName) || key;
      }
    }
    groups.set(key, group);
  }
  return [...groups.values()].filter((g) => g.visits > 0);
}

export function topMerchantsSlide(ctx: WrappedContext): WrappedSlide {
  const { transactions, fixedCategoryIds } = ctx.input;
  const rows = countedRows(transactions, ctx.period).filter(
    ({ txn }) => !isPersonCounterparty(txn) && isDiscretionary(txn, fixedCategoryIds),
  );
  const groups = groupMerchants(rows).sort(
    (a, b) => b.visits - a.visits || b.net - a.net || a.label.localeCompare(b.label),
  );
  if (groups.length === 0) return { id: "top-merchants", available: false, facts: [] };

  const allVisits = groups.reduce((sum, g) => sum + g.visits, 0);
  const top = groups.slice(0, TOP_MERCHANTS);
  const topVisits = top.reduce((sum, g) => sum + g.visits, 0);
  const windowProvenance = provenanceOf(groups.flatMap((g) => g.rows));

  const facts: WrappedFact[] = [];
  top.forEach((g, i) => {
    const provenance = provenanceOf(g.rows);
    const rank = i + 1;
    facts.push(
      makeFact(`merchant.${rank}.name`, g.label, "text", ctx.period, provenance),
      makeFact(`merchant.${rank}.visits`, g.visits, "count", ctx.period, provenance),
      makeFact(`merchant.${rank}.spend`, g.net, "vnd", ctx.period, provenance),
    );
  });
  facts.push(
    makeFact("distinct-merchants", groups.length, "count", ctx.period, windowProvenance),
    makeFact(
      "top3-share",
      pctOf(topVisits, allVisits),
      "pct",
      ctx.period,
      windowProvenance,
      "Tỷ lệ lượt chi của 3 nơi chi nhiều lượt nhất trên tổng lượt chi không cố định",
    ),
  );
  return { id: "top-merchants", available: true, facts };
}
