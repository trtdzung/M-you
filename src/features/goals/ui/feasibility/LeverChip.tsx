import { formatDate, formatVnd } from "@/lib/format";
import type { Lever } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { chip } from "../styles";

function leverLabel(lever: Lever): string {
  const c = GOALS_COPY.feasibility;
  if (lever.kind === "extend_date") return c.extendDate(formatDate(lever.newDate));
  if (lever.kind === "reduce_amount") return c.reduceAmount(formatVnd(lever.newTarget));
  const text = c.cutCategory(lever.categoryLabel, formatVnd(lever.cutPerMonth));
  return lever.enough ? text : `${text}. ${c.cutNotEnough}`;
}

/** Extend/reduce levers change the form when pressed; the category cut is advice only. */
export function LeverChip({ lever, onApply }: { lever: Lever; onApply: (lever: Lever) => void }) {
  const label = leverLabel(lever);
  if (lever.kind === "cut_category") {
    return <span className="text-xs text-muted">{label}</span>;
  }
  return (
    <button type="button" onClick={() => onApply(lever)} className={chip}>
      {label}
    </button>
  );
}
