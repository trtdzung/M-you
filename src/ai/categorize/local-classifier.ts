/**
 * Local heuristic classifier — a tiny deterministic merchant-keyword table so
 * dev/test/demo run with no network and no model. It is NOT AI and must never be
 * presented as such (Red Team #9): callers tag its output `origin: "heuristic"`
 * ("Gợi ý tự động"), never "ai".
 *
 * It reports a deliberately LOW, fixed confidence so results land as `pending`
 * under the default threshold — a heuristic guess is never trusted enough to
 * auto-apply and change a total. Merchants it does not recognise get no result
 * (the txn stays unclassified — we never fabricate a category).
 *
 * `KEYWORD_RULES` stays a merchant→PRESET table: it is hand-authored against the
 * bundled seed, and guessing that "Trường ABC" means a category the user happens
 * to have called "Học phí" would be a new, unasked-for inference. What DID change
 * (Phase 03) is that its output is filtered through the persona's live ASSIGNABLE
 * set, so a preset that persona archived stops firing and the heuristic can never
 * assign an id no picker offers.
 */

import type { ClassifyFn, ClassifyResult } from "./types";

/** Fixed heuristic confidence — below the default 0.8 gate ⇒ suggestions pend. */
const HEURISTIC_CONFIDENCE = 0.5;

/** normalized-merchant keyword → categoryId. First match wins (order matters). */
const KEYWORD_RULES: [string, string][] = [
  ["grabfood", "dining"],
  ["grab", "transport"],
  ["be", "transport"],
  ["petrolimex", "transport"],
  ["xăng", "transport"],
  ["highlands", "dining"],
  ["coffee", "dining"],
  ["pho", "dining"],
  ["phở", "dining"],
  ["nhà hàng", "dining"],
  ["winmart", "groceries"],
  ["bach hoa", "groceries"],
  ["bách hóa", "groceries"],
  ["coopmart", "groceries"],
  ["co.op", "groceries"],
  ["shopee", "shopping"],
  ["lazada", "shopping"],
  ["tiki", "shopping"],
  ["uniqlo", "shopping"],
  ["cgv", "entertainment"],
  ["steam", "entertainment"],
  ["karaoke", "entertainment"],
  ["netflix", "subscriptions"],
  ["spotify", "subscriptions"],
  ["gym", "subscriptions"],
  ["evn", "utilities"],
  ["nước", "utilities"],
  ["internet", "utilities"],
];

/**
 * Precompiled word-boundary matchers. A bare substring test would misfire on
 * short keys (e.g. "be" inside "Bibo Mart"), so each keyword must sit on a
 * whole-word boundary. `\p{L}\p{N}` (with the `u` flag) treats Unicode letters
 * and digits as word characters, so multi-word keys ("bach hoa") and diacritics
 * both bound correctly.
 */
const KEYWORD_MATCHERS: [RegExp, string][] = KEYWORD_RULES.map(([needle, categoryId]) => {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "u"), categoryId];
});

/**
 * Match one normalized merchant to a category id, or `undefined`.
 *
 * `assignable` is the persona's live assignable id set. A match outside it is
 * DROPPED, not substituted: the merchant simply goes unrecognised and the txn
 * stays unclassified, exactly as for a merchant with no rule at all. Omitting the
 * set keeps the raw table behaviour and is for rule-level unit tests only —
 * production callers use `createLocalClassify`.
 */
export function heuristicMatch(merchant: string, assignable?: ReadonlySet<string>): string | undefined {
  const m = merchant.toLowerCase();
  for (const [re, categoryId] of KEYWORD_MATCHERS) {
    if (re.test(m)) return !assignable || assignable.has(categoryId) ? categoryId : undefined;
  }
  return undefined;
}

/**
 * Build the heuristic `ClassifyFn` for one persona's assignable taxonomy.
 * Deterministic; unknown (or non-assignable) merchants yield nothing.
 */
export function createLocalClassify(assignable: ReadonlySet<string>): ClassifyFn {
  return async (inputs) => {
    const out: ClassifyResult[] = [];
    for (const input of inputs) {
      const categoryId = heuristicMatch(input.merchant, assignable);
      if (categoryId) out.push({ txnId: input.txnId, categoryId, confidence: HEURISTIC_CONFIDENCE });
    }
    return out;
  };
}
