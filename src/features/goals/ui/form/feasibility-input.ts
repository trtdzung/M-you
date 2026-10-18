import { parseVndInput } from "@/components/settings/parse-vnd-input";
import type { FeasibilityInput } from "../../model/types";
import type { GoalFormValues } from "./form-parse";

function amountOf(raw: string): number | undefined {
  const parsed = parseVndInput(raw);
  return parsed.kind === "ok" ? parsed.value : undefined;
}

/** Form text -> input of the what-if check; unparseable parts are simply left out. */
export function feasibilityInputOf(values: GoalFormValues, estimate: string): FeasibilityInput {
  return {
    targetAmount: amountOf(values.targetAmount) ?? null,
    targetDate: values.targetDate || undefined,
    currentAmount: amountOf(values.openingAmount),
    flexibility: values.flexibility,
    estimatedMonthlySurplus: amountOf(estimate),
  };
}
