"use client";

import { useLedgerMutation } from "../../client/hooks/use-ledger-mutation";
import type { GoalLedgerKind, SavingsGoalView } from "../../model/types";
import { ContributeSheet } from "../ledger/ContributeSheet";
import { WithdrawSheet } from "../ledger/WithdrawSheet";

/** Deposit or withdraw sheet wired to the ledger API; unmounting resets it. */
export function LedgerFlow({
  goal,
  kind,
  onClose,
  onDone,
}: {
  goal: SavingsGoalView;
  kind: GoalLedgerKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const { add, pending, errors } = useLedgerMutation();

  async function submit(entry: { amount: number; note?: string }) {
    const res = await add(goal.id, { kind, ...entry });
    if (res?.ok) {
      onDone();
      onClose();
    }
  }

  const common = {
    pending,
    error: errors?.amount,
    formError: errors && !errors.amount ? (errors._form ?? "") : null,
    onClose,
  };
  if (kind === "deposit") {
    return <ContributeSheet {...common} onSubmit={(amount) => submit({ amount })} />;
  }
  return (
    <WithdrawSheet
      {...common}
      goalName={goal.name}
      currentAmount={goal.currentAmount}
      monthlyPace={
        goal.monthlyContribution ??
        (goal.feasibility.requiredMonthly > 0 ? goal.feasibility.requiredMonthly : null)
      }
      onSubmit={submit}
    />
  );
}
