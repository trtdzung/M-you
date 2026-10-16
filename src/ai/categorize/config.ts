/**
 * Categorize tuning. Kept tiny and dependency-free so both the service and any
 * UI can read the same thresholds.
 */

/**
 * Minimum confidence for an assignment to be AUTO-APPLIED (counted immediately).
 * Below it, the assignment is `pending` — surfaced as a suggestion but NOT
 * counted until the user confirms (the trust model: unsure ⇒ don't count).
 */
export const CATEGORIZE_CONFIDENCE_THRESHOLD = 0.8;

/** Max items per classifier call — bounds token/size and isolates chunk failure. */
export const CATEGORIZE_CHUNK_SIZE = 50;

/**
 * Feature flag (outermost gate). Defaults ON for the prototype; a build can set
 * `NEXT_PUBLIC_ENABLE_AUTO_CATEGORIZE=false` to disable the whole feature.
 */
export function isAutoCategorizeEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_AUTO_CATEGORIZE;
  return raw !== "false" && raw !== "0";
}
