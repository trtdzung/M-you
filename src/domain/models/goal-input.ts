/**
 * Manual goal entry — validation + the versioned, per-record storage shape.
 * Mirrors `asset-liability-input.ts` exactly: this is the SOLE gate between the
 * free-text `GoalEditor` form and the domain `Goal` model. A blank/NaN/negative/
 * over-cap amount or an invalid date can never reach the engine (invariants
 * #5/#6). A goal stores an optional saved monthly contribution so the projection
 * has a starting assumption; the direct-tap what-if adjusts it without mutating
 * the goal.
 *
 * Two guard tiers:
 *  - `validateGoalInput` guards the in-app UI path.
 *  - `isValidGoalRecord` guards the storage path with the same contract, applied
 *    PER RECORD so one corrupt goal never wipes its siblings (red-team #4).
 *
 * The store is versioned (`{ version, records }`) so a future shape change has a
 * forward migration path instead of a silent total wipe.
 */

import type { DataSource, Goal } from "./index";
import { MAX_VND } from "./asset-liability-input";

const MAX_NAME_LEN = 80;

export const GOAL_STORE_VERSION = 1 as const;

/**
 * A user-authored goal record: the domain `Goal` plus the saved monthly
 * contribution (the projection's default assumption). Assignable to `Goal`, so
 * every `Goal` consumer accepts it unchanged.
 */
export interface GoalRecord extends Goal {
  /** Saved monthly contribution (VND); null when the user hasn't set one (#6). */
  monthlyContribution: number | null;
}

// ---------------------------------------------------------------------------
// UI-form draft + validation result
// ---------------------------------------------------------------------------

export interface GoalDraft {
  name: string;
  /** Raw VND string for the target amount; required, must be > 0. */
  targetAmount: string;
  /** ISO date "YYYY-MM-DD" or ""; the target deadline (optional). */
  targetDate: string;
  /** Raw VND monthly contribution; "" means genuinely unset (kept null). */
  monthlyContribution: string;
}

export interface GoalFields {
  name: string;
  targetAmount: number;
  targetDate: string | null;
  monthlyContribution: number | null;
}

export type FieldErrors = Record<string, string>;

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  errors: FieldErrors;
}

// ---------------------------------------------------------------------------
// Parsing helpers (never let NaN/Infinity/negative through)
// ---------------------------------------------------------------------------

type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

/** Parse an optional non-negative whole-VND amount. "" → null (unknown). */
function parseOptionalVnd(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.includes("-")) return { ok: false, error: "Không được âm" };
  const digits = trimmed.replace(/[.,\s₫]/g, "");
  if (!/^\d+$/.test(digits)) return { ok: false, error: "Giá trị không hợp lệ" };
  const n = Number(digits);
  if (!Number.isFinite(n)) return { ok: false, error: "Giá trị không hợp lệ" };
  if (n > MAX_VND) return { ok: false, error: "Giá trị quá lớn" };
  return { ok: true, value: n };
}

export function validateGoalInput(draft: GoalDraft): ValidationResult<GoalFields> {
  const errors: FieldErrors = {};

  const name = draft.name.trim();
  if (name === "") errors.name = "Nhập tên";
  else if (name.length > MAX_NAME_LEN) errors.name = `Tối đa ${MAX_NAME_LEN} ký tự`;

  // Target amount is REQUIRED and must be a real positive figure.
  const target = parseOptionalVnd(draft.targetAmount);
  if (!target.ok) errors.targetAmount = target.error;
  else if (target.value === null) errors.targetAmount = "Nhập số tiền mục tiêu";
  else if (target.value <= 0) errors.targetAmount = "Phải lớn hơn 0";

  // Target date optional; if provided it must parse (reject invalid dates).
  let targetDate: string | null = null;
  const dateRaw = draft.targetDate.trim();
  if (dateRaw !== "") {
    if (Number.isNaN(Date.parse(dateRaw))) errors.targetDate = "Ngày không hợp lệ";
    else targetDate = dateRaw;
  }

  const contribution = parseOptionalVnd(draft.monthlyContribution);
  if (!contribution.ok) errors.monthlyContribution = contribution.error;

  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };

  return {
    ok: true,
    errors: {},
    value: {
      name,
      targetAmount: (target as { value: number }).value,
      targetDate,
      monthlyContribution: (contribution as { value: number | null }).value,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-record storage guard (drop one bad element, keep the rest — red-team #4)
// ---------------------------------------------------------------------------

const DATA_SOURCES: DataSource[] = ["msb", "self_reported", "estimated", "mock"];

function isSaneAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_VND;
}

function isSaneAmountOrNull(v: unknown): v is number | null {
  return v === null || isSaneAmount(v);
}

export function isValidGoalRecord(value: unknown): value is GoalRecord {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === "string" && g.id !== "" &&
    typeof g.name === "string" && g.name !== "" &&
    isSaneAmount(g.targetAmount) &&
    isSaneAmount(g.currentAmount) &&
    (g.targetDate === null || typeof g.targetDate === "string") &&
    DATA_SOURCES.includes(g.source as DataSource) &&
    isSaneAmountOrNull(g.monthlyContribution)
  );
}
