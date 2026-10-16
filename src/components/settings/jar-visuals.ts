import {
  Wallet,
  Utensils,
  Car,
  Home,
  ShoppingBag,
  HeartPulse,
  PiggyBank,
  Sparkles,
  Briefcase,
  GraduationCap,
  Plane,
  Gift,
  type LucideIcon,
} from "lucide-react";

/**
 * A small, fixed set of hũ icons keyed by a stable string stored on `Jar.icon`.
 * Presentation only — the engine never reads it. Keeping the map here (not in a
 * component) lets the list, editor, and picker share one source of truth.
 */
const JAR_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  food: Utensils,
  transport: Car,
  home: Home,
  shopping: ShoppingBag,
  health: HeartPulse,
  savings: PiggyBank,
  fun: Sparkles,
  work: Briefcase,
  education: GraduationCap,
  travel: Plane,
  gift: Gift,
};

export const JAR_ICON_KEYS: readonly string[] = Object.keys(JAR_ICONS);

/** Resolve a jar's icon key to a component, defaulting to the wallet. */
export function jarIcon(key?: string): LucideIcon {
  return (key && JAR_ICONS[key]) || Wallet;
}
