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

/** Fixed in-page anchor for the Dòng tiền monthly-report card (red-team #12). */
export const REPORT_ANCHOR = "bao-cao-brief";

/** Whitelisted navigation intents. Kept separate from LLM `IntentKind`. */
export type CopilotIntent =
  | "open-cashflow" // Dòng tiền (chart chi tiêu theo hũ)
  | "open-hu" // Hũ top-level tab (số dư chia theo hũ)
  | "open-transactions" // full transaction feed (Tài khoản)
  | "open-report" // Dòng tiền · report card (advisory entry)
  | "open-wealth" // Tài sản & Nợ manager
  | "open-overview" // Tổng quan
  | "open-assistant"; // dedicated copilot chat

/** Each intent resolves to one fixed route. No params, no interpolation. */
const ROUTES: Record<CopilotIntent, string> = {
  "open-cashflow": `${PFM_HUB}?tab=cashflow`,
  "open-hu": `${PFM_HUB}?tab=hu`,
  "open-transactions": "/transactions",
  "open-report": `${PFM_HUB}?tab=cashflow#${REPORT_ANCHOR}`,
  "open-wealth": `${PFM_HUB}/wealth`,
  "open-overview": `${PFM_HUB}?tab=overview`,
  "open-assistant": "/assistant",
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
