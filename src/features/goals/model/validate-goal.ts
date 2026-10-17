import type {
  FieldErrors,
  GoalCreateInput,
  GoalStatus,
  GoalUpdateInput,
  ValidationResult,
} from "./types";
import {
  checkDate,
  checkFlex,
  checkName,
  checkOptionalAmount,
  checkTarget,
} from "./validate-fields";

const STATUSES: readonly string[] = ["active", "paused", "archived"];

type Raw = Record<string, unknown>;

export function validateGoalCreate(
  input: unknown,
  now: Date,
): ValidationResult<GoalCreateInput> {
  const raw: Raw = input && typeof input === "object" ? (input as Raw) : {};
  const errors: FieldErrors = {};
  const name = checkName(raw.name, errors);
  const targetAmount = checkTarget(raw.targetAmount, errors);
  const targetDate = checkDate(raw.targetDate, now, errors);
  const flexibility = checkFlex(raw.flexibility, errors);
  const monthly = checkOptionalAmount(raw.monthlyContribution, "monthlyContribution", errors);
  const opening = checkOptionalAmount(raw.openingAmount, "openingAmount", errors);
  if (
    opening != null &&
    targetAmount !== undefined &&
    opening >= targetAmount &&
    !errors.openingAmount
  ) {
    errors.openingAmount = "Số đã có phải nhỏ hơn số tiền mục tiêu";
  }
  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };
  return {
    ok: true,
    errors,
    value: {
      name: name!,
      targetAmount: targetAmount!,
      targetDate: targetDate!,
      flexibility: flexibility!,
      monthlyContribution: monthly ?? null,
      openingAmount: opening ?? null,
    },
  };
}

/** Partial update: only the fields present are checked and returned. */
export function validateGoalUpdate(
  input: unknown,
  now: Date,
): ValidationResult<GoalUpdateInput> {
  const raw: Raw = input && typeof input === "object" ? (input as Raw) : {};
  const errors: FieldErrors = {};
  const value: GoalUpdateInput = {};
  const has = (k: string) => raw[k] !== undefined;
  if (has("name")) value.name = checkName(raw.name, errors);
  if (has("targetAmount")) value.targetAmount = checkTarget(raw.targetAmount, errors);
  if (has("targetDate")) value.targetDate = checkDate(raw.targetDate, now, errors);
  if (has("flexibility")) value.flexibility = checkFlex(raw.flexibility, errors);
  if (has("monthlyContribution")) {
    value.monthlyContribution = checkOptionalAmount(
      raw.monthlyContribution,
      "monthlyContribution",
      errors,
    );
  }
  if (has("status")) {
    if (typeof raw.status === "string" && STATUSES.includes(raw.status)) {
      value.status = raw.status as GoalStatus;
    } else {
      errors.status = "Trạng thái không hợp lệ";
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };
  return { ok: true, errors, value };
}
