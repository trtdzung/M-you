import type { WrappedDeck } from "@/domain/wrapped";

/**
 * Short, stable fingerprint of a deck's content (FNV-1a over its JSON). Used only as
 * a React `key` so a genuinely different deck remounts the viewer (index and mask
 * reset) instead of being patched under the user. Not security-relevant.
 */
export function deckHash(deck: WrappedDeck): string {
  const text = JSON.stringify(deck);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
