/**
 * Manual asset/liability entry — validation + the versioned, per-record storage
 * shape. This is the SOLE gate between the free-text editor forms and the domain
 * `Asset`/`Liability` models: a blank/NaN/negative/over-cap value, or an unknown
 * enum type, can never reach the engine (invariants #5/#6).
 *
 * Two guard tiers, mirroring the jars boundary:
 *  - `validateAssetInput`/`validateLiabilityInput` guard the in-app UI path.
 *  - `isValidAssetRecord`/`isValidLiabilityRecord` guard the storage path with the
 *    same numeric contract, applied PER RECORD so one corrupt element never wipes
 *    its siblings (red-team #4).
 *
 * The store is versioned (`{ version, records }`) so a future shape change has a
 * forward migration path instead of a silent total wipe.
 */

import type { Asset, AssetType, DataSource, Liability, LiabilityType } from "./index";

// ---------------------------------------------------------------------------
// Enums + sane caps (a hand-authored VND figure above these is a typo, not data)
// ---------------------------------------------------------------------------

export const ASSET_TYPES: AssetType[] = [
  "cash", "deposit", "fund", "stock", "gold", "real_estate", "vehicle", "other",
];
export const LIABILITY_TYPES: LiabilityType[] = [
  "credit_card", "personal_loan", "mortgage", "instalment", "other",
];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  cash: "Tiền mặt", deposit: "Tiền gửi", fund: "Quỹ", stock: "Cổ phiếu",
  gold: "Vàng", real_estate: "Bất động sản", vehicle: "Phương tiện", other: "Khác",
};
export const LIABILITY_TYPE_LABEL: Record<LiabilityType, string> = {
  credit_card: "Thẻ tín dụng", personal_loan: "Vay tiêu dùng", mortgage: "Vay mua nhà",
  instalment: "Trả góp", other: "Khác",
};

/** 100 nghìn tỷ — a plausible ceiling; anything above is a data-entry error. */
export const MAX_VND = 100_000_000_000_000;
const MAX_NAME_LEN = 80;
const MAX_NOTE_LEN = 200;
const MAX_TERM_MONTHS = 1200; // 100 years — beyond this is a typo.

/** Versioned, persona-scoped store envelope for a user-record collection. */
export const ASSET_STORE_VERSION = 1 as const;
export const LIABILITY_STORE_VERSION = 1 as const;

export interface UserRecordStore<T> {
  version: number;
  records: T[];
}

// ---------------------------------------------------------------------------
// UI-form drafts + validation results
// ---------------------------------------------------------------------------

export interface AssetDraft {
  name: string;
  type: AssetType;
  /** Raw VND string; "" means the valuation is genuinely unknown (kept null). */
  value: string;
  note: string;
}

export interface AssetFields {
  name: string;
  type: AssetType;
  value: number | null;
  note: string | null;
}

export interface LiabilityDraft {
  name: string;
  type: LiabilityType;
  /** Raw VND string; "" means the balance is genuinely unknown. */
  balance: string;
  /** Raw annual interest percent, e.g. "14" or "14.5"; "" means unknown. */
  rate: string;
  /** Raw VND minimum/next payment; "" means unknown. */
  minimumPayment: string;
  /** ISO date "YYYY-MM-DD" or ""; the next payment due date. */
  dueDate: string;
  /** Raw remaining-term months; "" means unknown. */
  remainingTerm: string;
}

export interface LiabilityFields {
  name: string;
  type: LiabilityType;
  outstandingPrincipal: number | null;
  interestRate: number | null;
  minimumPayment: number | null;
  dueDate: string | null;
  remainingTerm: number | null;
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
function parseVnd(raw: string): ParseResult {
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

/** Parse an optional annual interest percent in [0,100] → stored fraction. */
function parsePercent(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed.replace(",", ".").replace(/[%\s]/g, ""));
  if (!Number.isFinite(n)) return { ok: false, error: "Lãi suất không hợp lệ" };
  if (n < 0) return { ok: false, error: "Không được âm" };
  if (n > 100) return { ok: false, error: "Tối đa 100%" };
  return { ok: true, value: n / 100 };
}

/** Parse an optional non-negative integer term in months. */
function parseTerm(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: "Kỳ hạn không hợp lệ" };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n > MAX_TERM_MONTHS) return { ok: false, error: "Kỳ hạn quá lớn" };
  return { ok: true, value: n };
}

function validName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name === "") return { ok: false, error: "Nhập tên" };
  if (name.length > MAX_NAME_LEN) return { ok: false, error: `Tối đa ${MAX_NAME_LEN} ký tự` };
  return { ok: true, value: name };
}

function validDueDate(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return { ok: false, error: "Ngày không hợp lệ" };
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Validators — the sole gate to the model
// ---------------------------------------------------------------------------

export function validateAssetInput(draft: AssetDraft): ValidationResult<AssetFields> {
  const errors: FieldErrors = {};

  const name = validName(draft.name);
  if (!name.ok) errors.name = name.error;

  if (!ASSET_TYPES.includes(draft.type)) errors.type = "Loại không hợp lệ";

  const value = parseVnd(draft.value);
  if (!value.ok) errors.value = value.error;

  const note = draft.note.trim();
  if (note.length > MAX_NOTE_LEN) errors.note = `Tối đa ${MAX_NOTE_LEN} ký tự`;

  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };

  return {
    ok: true,
    errors: {},
    value: {
      name: (name as { value: string }).value,
      type: draft.type,
      value: (value as { value: number | null }).value,
      note: note === "" ? null : note,
    },
  };
}

export function validateLiabilityInput(draft: LiabilityDraft): ValidationResult<LiabilityFields> {
  const errors: FieldErrors = {};

  const name = validName(draft.name);
  if (!name.ok) errors.name = name.error;

  if (!LIABILITY_TYPES.includes(draft.type)) errors.type = "Loại không hợp lệ";

  const balance = parseVnd(draft.balance);
  if (!balance.ok) errors.balance = balance.error;

  const rate = parsePercent(draft.rate);
  if (!rate.ok) errors.rate = rate.error;

  const minimumPayment = parseVnd(draft.minimumPayment);
  if (!minimumPayment.ok) errors.minimumPayment = minimumPayment.error;

  const dueDate = validDueDate(draft.dueDate);
  if (!dueDate.ok) errors.dueDate = dueDate.error;

  const remainingTerm = parseTerm(draft.remainingTerm);
  if (!remainingTerm.ok) errors.remainingTerm = remainingTerm.error;

  if (Object.keys(errors).length > 0) return { ok: false, value: null, errors };

  return {
    ok: true,
    errors: {},
    value: {
      name: (name as { value: string }).value,
      type: draft.type,
      outstandingPrincipal: (balance as { value: number | null }).value,
      interestRate: (rate as { value: number | null }).value,
      minimumPayment: (minimumPayment as { value: number | null }).value,
      dueDate: (dueDate as { value: string | null }).value,
      remainingTerm: (remainingTerm as { value: number | null }).value,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-record storage guards (drop one bad element, keep the rest — red-team #4)
// ---------------------------------------------------------------------------

const DATA_SOURCES: DataSource[] = ["msb", "self_reported", "estimated", "mock"];

/** A finite, non-negative, in-cap number OR genuinely-null (unknown). */
function isSaneAmountOrNull(v: unknown): v is number | null {
  if (v === null) return true;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_VND;
}

export function isValidAssetRecord(value: unknown): value is Asset {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.id === "string" && a.id !== "" &&
    ASSET_TYPES.includes(a.type as AssetType) &&
    typeof a.name === "string" && a.name !== "" &&
    isSaneAmountOrNull(a.value) &&
    typeof a.currency === "string" &&
    DATA_SOURCES.includes(a.source as DataSource) &&
    typeof a.lastUpdatedAt === "string" &&
    typeof a.isEstimated === "boolean"
  );
}

export function isValidLiabilityRecord(value: unknown): value is Liability {
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  const rateOk =
    l.interestRate === null ||
    (typeof l.interestRate === "number" && Number.isFinite(l.interestRate) && l.interestRate >= 0 && l.interestRate <= 1);
  const termOk =
    l.remainingTerm === null ||
    (typeof l.remainingTerm === "number" && Number.isInteger(l.remainingTerm) && l.remainingTerm >= 0 && l.remainingTerm <= MAX_TERM_MONTHS);
  const dueOk = l.dueDate === null || typeof l.dueDate === "string";
  return (
    typeof l.id === "string" && l.id !== "" &&
    LIABILITY_TYPES.includes(l.type as LiabilityType) &&
    typeof l.name === "string" && l.name !== "" &&
    isSaneAmountOrNull(l.outstandingPrincipal) &&
    rateOk &&
    isSaneAmountOrNull(l.minimumPayment) &&
    dueOk &&
    termOk &&
    DATA_SOURCES.includes(l.source as DataSource) &&
    typeof l.lastUpdatedAt === "string"
  );
}

/** Structural guard for the versioned store envelope (elements checked separately). */
export function isUserRecordStore(value: unknown): value is UserRecordStore<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.version === "number" && Array.isArray(s.records);
}
