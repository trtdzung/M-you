/**
 * Text-fact hygiene (Nghị định 13/2023 data minimisation + render safety): NFC,
 * strip control and every invisible format character (bidi marks/overrides/isolates,
 * zero-width, word joiner, BOM, ...), trim, cap length.
 */

import { LABEL_MAX } from "./wrapped-thresholds";

/** `Cc` = C0, DEL and C1 controls; `Cf` = all Unicode format characters. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** Sanitized label of at most `max` characters; truncation ends with "…". */
export function sanitizeLabel(raw: string, max: number = LABEL_MAX): string {
  const cleaned = raw.normalize("NFC").replace(INVISIBLE, "").trim();
  const chars = Array.from(cleaned); // code points, so an emoji is never split
  if (chars.length <= max) return cleaned;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}
