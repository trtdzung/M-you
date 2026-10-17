import { MAX_VND } from "@/domain/models/asset-liability-input";
import type {
  FieldErrors,
  GoalCreateInput,
  GoalFlexibility,
  GoalStatus,
  GoalUpdateInput,
  ValidationResult,
} from "./types";

const MAX_NAME_LEN = 80;
const FLEXIBILITIES: readonly string[] = ["fixed", "flexible"];
const STATUSES: readonly string[] = ["active", "paused", "archived"];

type Raw = Record<string, unknown>;

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** Valid "YYYY-MM-DD" calendar date. */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function todayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function checkName(v: unknown, errors: FieldErrors): string | undefined {
  const name = typeof v === "string" ? v.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME_LEN) {
    errors.name = "Tên mục tiêu từ 1 đến 80 ký tự";
    return undefined;
  }
  return name;
}

function checkTarget(v: unknown, errors: FieldErrors): number | undefined {
  if (!isInt(v) || v <= 0 || v > MAX_VND) {
    errors.targetAmount = "Số tiền mục tiêu phải là số nguyên dương hợp lệ";
    return undefined;
  }
  return v;
}

function checkDate(v: unknown, now: Date, errors: FieldErrors): string | undefined {
  if (!isIsoDate(v)) {
    errors.targetDate = "Ngày không hợp lệ";
    return undefined;
  }
  if (v <= todayOf(now)) {
    errors.targetDate = "Ngày mục tiêu phải sau hôm nay";
    return undefined;
  }
  return v;
}

function checkFlex(v: unknown, errors: FieldErrors): GoalFlexibility | undefined {
  if (typeof v !== "string" || !FLEXIBILITIES.includes(v)) {
    errors.flexibility = "Loại mục tiêu không hợp lệ";
    return undefined;
  }
  return v as GoalFlexibility;
}

/** undefined/null -> null (not set); otherwise a non-negative integer. */
function checkOptionalAmount(
  v: unknown,
  field: string,
  errors: FieldErrors,
): number | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isInt(v) || v < 0 || v > MAX_VND) {
    errors[field] = "Số tiền phải là số nguyên không âm";
    return undefined;
  }
  return v;
}

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
