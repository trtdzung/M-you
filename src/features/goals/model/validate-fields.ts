import { MAX_VND } from "@/domain/models/asset-liability-input";
import { todayVn } from "./today";
import type { FieldErrors, GoalFlexibility } from "./types";

const MAX_NAME_LEN = 80;
const FLEXIBILITIES: readonly string[] = ["fixed", "flexible"];

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** Valid "YYYY-MM-DD" calendar date. */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function checkName(v: unknown, errors: FieldErrors): string | undefined {
  const name = typeof v === "string" ? v.trim() : "";
  if (name.length < 1 || name.length > MAX_NAME_LEN) {
    errors.name = "Tên mục tiêu từ 1 đến 80 ký tự";
    return undefined;
  }
  return name;
}

export function checkRequestKey(v: unknown, errors: FieldErrors): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || v.length < 1 || v.length > 80) {
    errors.requestKey = "Mã yêu cầu từ 1 đến 80 ký tự";
    return undefined;
  }
  return v;
}

export function checkTarget(v: unknown, errors: FieldErrors): number | undefined {
  if (!isInt(v) || v <= 0 || v > MAX_VND) {
    errors.targetAmount = "Số tiền mục tiêu phải là số nguyên dương hợp lệ";
    return undefined;
  }
  return v;
}

export function checkDate(v: unknown, now: Date, errors: FieldErrors): string | undefined {
  if (!isIsoDate(v)) {
    errors.targetDate = "Ngày không hợp lệ";
    return undefined;
  }
  if (v <= todayVn(now)) {
    errors.targetDate = "Ngày mục tiêu phải sau hôm nay";
    return undefined;
  }
  return v;
}

export function checkFlex(v: unknown, errors: FieldErrors): GoalFlexibility | undefined {
  if (typeof v !== "string" || !FLEXIBILITIES.includes(v)) {
    errors.flexibility = "Loại mục tiêu không hợp lệ";
    return undefined;
  }
  return v as GoalFlexibility;
}

/** undefined/null -> null (not set); otherwise a non-negative integer. */
export function checkOptionalAmount(
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
