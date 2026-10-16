/**
 * Copilot universal jump — the single, deterministic source of truth for every
 * intent-driven deep-link in the PFM IA (copilot suggested-action CTAs and the
 * advisory "nên làm gì" CTAs alike).
 *
 * This is a STATIC CODE WHITELIST, not an LLM navigation authority (invariant #2):
 * the model never navigates outside this map, and it never executes an action —
 * `resolveIntentRoute` only returns a URL string that a user-tapped CTA links to.
 *
 * Every intent maps to a FIXED route with no free-text interpolation (red-team
 * #12): the Dòng tiền sub-hub docks were retired (Hũ is a top-level tab, the feed
 * lives at `/transactions`, the report is an in-page section), so there is no
 * per-intent param to smuggle a path through. Any non-whitelisted intent falls
 * back to the tab hub (`/pfm`) — never a dead-end and never an injected route.
 */

/** Tab hub fallback — safe landing for any unrecognized intent. */
export const PFM_HUB = "/pfm";

/** Fixed in-page anchor for the monthly-report card, now on the overview tab. */
export const REPORT_ANCHOR = "bao-cao-brief";

/** Whitelisted navigation intents. Kept separate from LLM `IntentKind`. */
export type CopilotIntent =
  | "open-cashflow" // Dòng tiền → gộp vào Tổng quan (plan 260910-1626)
  | "open-hu" // Hũ → tab Ngân sách (hạn mức/tháng theo hũ)
  | "open-transactions" // full transaction feed (Tài khoản)
  | "open-report" // báo cáo tháng (nay trên Tổng quan)
  | "open-wealth" // Tài sản & Nợ manager
  | "open-overview"; // Tổng quan

/**
 * Each intent resolves to one fixed route. No params, no interpolation. Remapped
 * for the BIDV 4-tab IA (plan 260910-1626): the `hu`/`cashflow` tabs are retired
 * so `open-hu` → the Ngân sách tab and `open-cashflow`/`open-report` → Tổng quan
 * (Dòng tiền + report folded in, phase 04). Deep links never dead-end (H1).
 */
const ROUTES: Record<CopilotIntent, string> = {
  "open-cashflow": `${PFM_HUB}?tab=overview`,
  "open-hu": `${PFM_HUB}?tab=budget`,
  "open-transactions": "/transactions",
  "open-report": `${PFM_HUB}?tab=overview#${REPORT_ANCHOR}`,
  "open-wealth": `${PFM_HUB}/wealth`,
  "open-overview": `${PFM_HUB}?tab=overview`,
};

/** True only for intent ids present in the whitelist. */
export function isCopilotIntent(value: unknown): value is CopilotIntent {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROUTES, value);
}

/**
 * Map a whitelisted intent to a PFM route. Unknown intent → `/pfm`. Pure and
 * deterministic — safe to unit-test and to call from any CTA. Never navigates on
 * its own.
 */
export function resolveIntentRoute(intent: string): string {
  return isCopilotIntent(intent) ? ROUTES[intent] : PFM_HUB;
}
