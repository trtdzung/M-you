/**
 * Validation for the jar monthly-limit input (extracted from the retired
 * balance-lens `jars.ts`). The BIDV wallet model has a single numeric jar input
 * — `budgetLimit`, a VND amount — so this validates an amount only: blank,
 * non-numeric, non-finite, or negative is rejected; anything else parses to a
 * whole-VND-capable number. It is the ONLY gate between the free-text settings
 * field and `Jar.budgetLimit`, so a `NaN`, `Infinity`, or negative never slips
 * through (an empty field is handled by the caller as "chưa đặt", not via here).
 */

/** Result of validating one raw jar-limit input string. */
export interface JarInputResult {
  ok: boolean;
  /** Parsed value when `ok`; null when rejected — never `NaN` into the engine. */
  value: number | null;
  /** Vietnamese error message when rejected; null when accepted. */
  error: string | null;
}

export function validateJarInput(raw: string): JarInputResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, value: null, error: "Nhập giá trị" };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, value: null, error: "Giá trị không hợp lệ" };
  if (n < 0) return { ok: false, value: null, error: "Không được âm" };
  return { ok: true, value: n, error: null };
}
