/**
 * Deterministic PRNG utilities for fixture generation. Same seed => same data,
 * so tests and demos are stable. Never use bare Math.random in fixtures.
 */

/** mulberry32 — small, fast, seedable 32-bit PRNG returning [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Pick one element (throws on empty for fail-fast in fixtures). */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() from empty array");
  return items[Math.floor(rng() * items.length)];
}

/** Return true with the given probability [0, 1]. */
export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

/** Amount jittered by ±pct, rounded to the nearest `round` VND. */
export function jitter(rng: Rng, base: number, pct: number, round = 1000): number {
  const factor = 1 + (rng() * 2 - 1) * pct;
  return Math.round((base * factor) / round) * round;
}
