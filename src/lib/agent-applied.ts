/**
 * Remembers, for this browser tab, which agent proposals the customer already
 * applied — so re-opening the chat (which reloads history and re-renders every
 * card) doesn't offer to apply the same jar change or top-up a second time.
 * `sessionStorage` only: device-local, cleared when the tab closes; a private
 * window or blocked storage just means the card offers itself again (the live
 * checks in each card still guard against a stale proposal).
 */

const PREFIX = "msb-pfm.agent-applied.";

/** Stable key for one proposal: persona + its exact payload (djb2 hash, keys stay short). */
export function proposalKey(cif: string, ui: unknown): string {
  const text = `${cif}|${JSON.stringify(ui)}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return `${PREFIX}${hash.toString(36)}`;
}

export function wasApplied(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markApplied(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // ignore storage errors
  }
}
