/**
 * Lightweight classnames helper. Filters falsy values and joins with a space.
 * Keeps the dependency footprint minimal (no clsx/tailwind-merge needed yet).
 */
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
    } else {
      out.push(String(value));
    }
  }
  return out.join(" ");
}
