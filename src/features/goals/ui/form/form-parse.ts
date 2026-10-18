import { parseVndInput } from "@/components/settings/parse-vnd-input";
import type { FieldErrors, GoalFlexibility } from "../../model/types";

/** Raw (string) values of the goal form. */
export interface GoalFormValues {
  name: string;
  targetAmount: string;
  targetDate: string;
  flexibility: GoalFlexibility;
  openingAmount: string;
  monthlyContribution: string;
}

export const EMPTY_FORM: GoalFormValues = {
  name: "",
  targetAmount: "",
  targetDate: "",
  flexibility: "flexible",
  openingAmount: "",
  monthlyContribution: "",
};

type MoneyField = "targetAmount" | "openingAmount" | "monthlyContribution";

/** Raw strings -> input object for the model validators, plus per-field parse errors. */
export function buildInput(
  values: GoalFormValues,
  mode: "create" | "update",
): { input: Record<string, unknown>; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const money = (field: MoneyField, emptyValue: null | undefined) => {
    const parsed = parseVndInput(values[field]);
    if (parsed.kind === "ok") return parsed.value;
    if (parsed.kind === "error") errors[field] = parsed.message;
    return emptyValue;
  };
  const input: Record<string, unknown> = {
    name: values.name,
    targetAmount: money("targetAmount", undefined),
    targetDate: values.targetDate,
    flexibility: values.flexibility,
    monthlyContribution: money("monthlyContribution", null),
  };
  if (mode === "create") input.openingAmount = money("openingAmount", null);
  return { input, errors };
}
