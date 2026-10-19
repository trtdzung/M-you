/**
 * Closing facts: how much the user taught the app (user-origin category
 * corrections only — `userEdited` is hard-set on every manual txn and would
 * overcount) and the data-quality share.
 */

import { makeFact, provenanceOf } from "./wrapped-fact";
import { countedRows } from "./wrapped-txn-rules";
import type { WrappedContext, WrappedSlide } from "./wrapped-types";

export function closingSlide(ctx: WrappedContext): WrappedSlide {
  const rows = countedRows(ctx.input.transactions, ctx.period);
  const provenance = provenanceOf(rows.map((r) => r.txn));
  const taught = rows.filter((r) => ctx.input.userCorrectedIds.has(r.txn.id)).length;
  const { unclassifiedPct } = ctx.coverage;

  return {
    id: "closing",
    available: true,
    facts: [
      // 0 is a real count here; the copy layer hides the line when it is 0.
      makeFact("taught-count", taught, "count", ctx.period, provenance),
      makeFact(
        "data-quality",
        unclassifiedPct === "unknown" ? "unknown" : 100 - unclassifiedPct,
        "pct",
        ctx.period,
        provenance,
        "Tỷ lệ chi tiêu đã có danh mục",
      ),
    ],
  };
}
