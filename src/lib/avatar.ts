/**
 * Deterministic initials avatar for names/institutions with no real logo asset
 * (recipient rows, bank rows). Presentation-only, never used by the engine.
 */
const AVATAR_COLORS = ["#F97316", "#0EA5E9", "#22C55E", "#A855F7", "#EF4444", "#14B8A6", "#EAB308", "#6366F1"];

export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export function avatarColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
