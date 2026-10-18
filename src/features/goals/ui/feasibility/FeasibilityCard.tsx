import type { FeasibilityResponse, Lever } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { warningBox } from "../styles";
import { FeasibilitySummary } from "./FeasibilitySummary";
import { FeasibilityUnknown } from "./FeasibilityUnknown";
import { LeverChips } from "./LeverChips";

const POSITIVE_BOX = "rounded-2xl bg-positive-soft px-3.5 py-3 text-sm text-text";

/** Verdict of the what-if check, shown inside the create form. Pure presentation. */
export function FeasibilityCard({
  data,
  loading,
  estimate,
  onEstimateChange,
  onApplyLever,
}: {
  data: FeasibilityResponse | null;
  loading: boolean;
  /** Raw text of the user's own monthly-surplus estimate. */
  estimate: string;
  onEstimateChange: (v: string) => void;
  onApplyLever: (lever: Lever) => void;
}) {
  const c = GOALS_COPY.feasibility;
  if (!data) {
    return loading ? <p className="text-xs text-muted">{c.calculating}</p> : null;
  }
  const { feasibility, levers } = data;
  // Keep the estimate box while typing, even after the verdict stops being "unknown".
  const showEstimate = feasibility.result === "unknown" || estimate !== "";
  return (
    <div className="flex flex-col gap-3">
      {feasibility.result === "met" && <p className={POSITIVE_BOX}>{c.met}</p>}
      {feasibility.result === "feasible" && (
        <div className={`${POSITIVE_BOX} flex flex-col gap-2`}>
          <p className="font-medium">{c.feasible}</p>
          <FeasibilitySummary feasibility={feasibility} />
        </div>
      )}
      {feasibility.result === "infeasible" && (
        <div className={`${warningBox} flex flex-col gap-3`}>
          <p className="font-medium">{c.infeasible}</p>
          <FeasibilitySummary feasibility={feasibility} />
          <LeverChips levers={levers} onApply={onApplyLever} />
        </div>
      )}
      {showEstimate && <FeasibilityUnknown value={estimate} onChange={onEstimateChange} />}
    </div>
  );
}
