/**
 * The hard guardrail. `validateNumeric` proves every monetary figure in the
 * narrative traces back to a tool result — fabricated numbers are rejected
 * (PFM-111). `validateSafety` blocks guarantee/prediction language AND false
 * claims that a transaction was performed (the facade never moves money).
 *
 * Grounding rules:
 *  - Numbers below AMOUNT_FLOOR (%, months, counts) are ignored.
 *  - 4-digit year-range values (e.g. "2026" in a period label) are ignored — the
 *    system prompt requires stating the period, so these are not amounts.
 *  - An amount is grounded if it equals a tool number within a tight 1% band, or
 *    exactly matches a sensible rounded form of one (nearest 1k/100k/1M or two
 *    significant figures). Tolerances do NOT compound.
 */

import { numbersIn } from "@/insights/narrate";
import type { ToolResult } from "@/ai/tools/types";

/** Below this, a number is a %, month count, etc. — not an amount. */
const AMOUNT_FLOOR = 1000;
/** Tight relative band for minor rounding on the EXACT value only. */
const EXACT_TOLERANCE = 0.01;

/** Recursively collect every finite number from a tool-result payload. */
function collectNumbers(value: unknown, into: Set<number>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(Math.abs(Math.round(value)));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, into);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
}

export function allowedNumbers(toolResults: ToolResult[]): Set<number> {
  const set = new Set<number>();
  for (const r of toolResults) collectNumbers(r.data, set);
  return set;
}

const roundTo = (n: number, unit: number): number => Math.round(n / unit) * unit;

/** Round to `sig` significant figures (for "6,5 triệu"-style rounding). */
function roundToSig(n: number, sig: number): number {
  if (n === 0) return 0;
  const digits = Math.ceil(Math.log10(Math.abs(n)));
  const factor = Math.pow(10, sig - digits);
  return Math.round(n * factor) / factor;
}

function grounded(amount: number, allowed: Set<number>): boolean {
  for (const n of allowed) {
    if (n === 0) continue;
    // Tight band on the exact value (typos / trailing rounding).
    if (Math.abs(amount - n) <= Math.max(1, n * EXACT_TOLERANCE)) return true;
    // Explicit rounded forms must match exactly (no band → no stacking).
    if (amount === roundTo(n, 1000) || amount === roundTo(n, 100_000) || amount === roundTo(n, 1_000_000)) return true;
    if (amount === roundToSig(n, 2) || amount === roundToSig(n, 3)) return true;
  }
  return false;
}

/** A 4-digit value inside a plausible year range — a period, not an amount. */
function isYear(n: number): boolean {
  return n >= 1900 && n <= 2100;
}

export interface NumericValidation {
  ok: boolean;
  ungrounded: number[];
}

export function validateNumeric(text: string, toolResults: ToolResult[]): NumericValidation {
  const allowed = allowedNumbers(toolResults);
  const amounts = numbersIn(text).filter((n) => n >= AMOUNT_FLOOR && !isYear(n));
  const ungrounded = amounts.filter((a) => !grounded(a, allowed));
  return { ok: ungrounded.length === 0, ungrounded };
}

const UNSAFE_PATTERNS: RegExp[] = [
  // Guaranteed returns / absolute predictions.
  /đảm\s*bảo\s*(lãi|lợi\s*nhuận|sinh\s*lời)/i,
  /cam\s*kết\s*(lãi|lợi\s*nhuận)/i,
  /chắc\s*chắn\s*(lãi|lời|tăng\s*giá|sinh\s*lời)/i,
  /guarantee(d)?\s*(return|profit)/i,
  /không\s*bao\s*giờ\s*(lỗ|mất)/i,
  // False claims that the assistant performed a transaction (it never can).
  /(mình|tôi)\s*đã\s*(chuyển|thanh\s*toán|thực\s*hiện|xác\s*nhận)/i,
  /đã\s*(chuyển|thanh\s*toán)[^.?!]{0,40}(cho\s*bạn|giúp\s*bạn|theo\s*yêu\s*cầu)/i,
  /đã\s*xác\s*nhận\s*(chuyển|giao\s*dịch|lệnh)/i,
  /(giao\s*dịch|lệnh\s*chuyển|chuyển\s*khoản)[^.?!]{0,30}(thành\s*công|hoàn\s*tất|đã\s*thực\s*hiện)/i,
];

export interface SafetyValidation {
  ok: boolean;
  matches: string[];
}

export function validateSafety(text: string): SafetyValidation {
  const matches: string[] = [];
  for (const p of UNSAFE_PATTERNS) {
    const m = text.match(p);
    if (m) matches.push(m[0]);
  }
  return { ok: matches.length === 0, matches };
}
