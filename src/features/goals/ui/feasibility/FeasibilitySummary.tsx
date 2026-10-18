import { Money, ProvenanceChip } from "@/components/primitives";
import type { GoalFeasibility } from "../../model/types";
import { GOALS_COPY } from "../copy";

/** "Cần góp X/tháng · Phần dư Y" with provenance of the estimated numbers. */
export function FeasibilitySummary({ feasibility }: { feasibility: GoalFeasibility }) {
  const c = GOALS_COPY.feasibility;
  return (
    <div className="flex flex-col gap-1 text-sm text-text">
      <p>
        {c.required} <Money amount={feasibility.requiredMonthly} className="font-semibold" />
        {c.perMonth} · {c.surplus}{" "}
        <Money amount={feasibility.surplus === "unknown" ? null : feasibility.surplus} />
        {c.perMonth}
      </p>
      <ProvenanceChip source={feasibility.source} />
    </div>
  );
}
