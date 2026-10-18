"use client";

import { Sheet } from "@/components/primitives";
import type { GoalFlexibility } from "../../model/types";
import { GOALS_COPY } from "../copy";
import { formatGoalMoney } from "../shared/format-goal-money";
import { primaryButton, secondaryButton, errorBox, fieldError } from "../styles";

export interface ConfirmPlanValues {
  name: string;
  targetAmount: number;
  /** "YYYY-MM-DD". */
  targetDate: string;
  flexibility: GoalFlexibility;
  openingAmount: number;
  /** Planned saving per month (VND). */
  monthly: number;
  /** Label of a jar the money could come from; display only, nothing is moved. */
  sourceHint: string | null;
}

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Shows exactly what will be written and writes nothing until the customer confirms. */
export function ConfirmPlan({
  values,
  pending,
  error,
  onConfirm,
  onEdit,
  onClose,
  open = true,
}: {
  values: ConfirmPlanValues;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onEdit: () => void;
  onClose: () => void;
  open?: boolean;
}) {
  const c = GOALS_COPY.advisor.confirm;
  const rows: [string, string][] = [
    [c.name, values.name],
    [c.target, `${formatGoalMoney(values.targetAmount)} (${values.targetAmount.toLocaleString("en-US")} VND)`],
    [c.date, dmy(values.targetDate)],
    [c.flexibility, GOALS_COPY.flexibility[values.flexibility]],
    [c.opening, values.openingAmount > 0 ? formatGoalMoney(values.openingAmount) : c.none],
    [c.monthly, `${formatGoalMoney(values.monthly)}${GOALS_COPY.feasibility.perMonth}`],
    ...(values.sourceHint ? [[c.source, values.sourceHint] as [string, string]] : []),
  ];
  return (
    <Sheet open={open} title={c.title} description={c.notice} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 text-[14px]">
              <dt className="text-muted">{label}</dt>
              <dd className="break-words text-right font-medium text-text">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="rounded-2xl bg-surface-muted px-3.5 py-3 text-[13px] leading-5 text-muted">{c.nothingWritten}</p>
        {error !== null && <div className={errorBox}><p className={fieldError}>{error || c.failed}</p></div>}
        <button type="button" disabled={pending} className={`${primaryButton} w-full`} onClick={() => { if (!pending) onConfirm(); }}>
          {pending ? c.creating : c.confirm}
        </button>
        <button type="button" disabled={pending} className={secondaryButton} onClick={onEdit}>{c.edit}</button>
      </div>
    </Sheet>
  );
}
