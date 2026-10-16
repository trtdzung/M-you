/**
 * Shared persona-scoped localStorage resource — the single implementation of the
 * "load / save / schema-guard / reseed" pattern jars originally pioneered here
 * (jars have since moved to a SQLite-backed `/api/jars*`, see `state/jars.tsx` and
 * `data/jars/schema.md` — they no longer use this helper). Phase 03
 * (assets/liabilities) and Phase 05 (goals) build their CRUD contexts on this one
 * helper instead of re-deriving persona keys, SSR guards, and try/catch each time
 * (DRY, red-team #6).
 *
 * Contract:
 * - Every record is namespaced per persona (`msb-pfm.{namespace}.{personaId}`) so
 *   one persona's user state never leaks into another (the H5 red-team item that
 *   originally motivated this).
 * - Reads validate through the caller's `guard`; anything missing, corrupt,
 *   schema-invalid, or unavailable (SSR / private mode / quota) falls back to a
 *   fresh deep-cloned `seed()` — it never throws and never returns a shared ref.
 * - All storage access is wrapped in try/catch; failures degrade to the seed
 *   (reads) or a no-op (writes).
 */

/** A namespaced, persona-scoped, schema-guarded localStorage handle. */
export interface PersonaLocalStorageResource<T> {
  /** The fully-qualified storage key (exposed for tests / debugging). */
  readonly key: string;
  /** Guard-valid stored value, else a fresh seed. Never throws. */
  load(): T;
  /** Raw stored value if present AND guard-valid, else null (no seeding). */
  read(): T | null;
  /** Persist a value. No-op on SSR or storage failure. */
  save(value: T): void;
  /** Remove the persona's record entirely. No-op on SSR or storage failure. */
  clear(): void;
  /** Delete the stored record and return a fresh seed (whole-store reset). */
  reseed(): T;
}

export interface PersonaLocalStorageOptions<T> {
  /** Logical resource name, e.g. "assets", "liabilities", "goals". */
  namespace: string;
  /** Active persona id — scopes the key so records never cross personas. */
  personaId: string;
  /** Schema guard: rejects stale/corrupt/foreign shapes before they reach state. */
  guard: (value: unknown) => value is T;
  /** Factory for a fresh default. Its output is deep-cloned before it escapes. */
  seed: () => T;
}

/** Deep clone so callers never mutate a shared seed reference. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function personaLocalStorageResource<T>(
  options: PersonaLocalStorageOptions<T>,
): PersonaLocalStorageResource<T> {
  const { namespace, personaId, guard, seed } = options;
  const key = `msb-pfm.${namespace}.${personaId}`;

  function read(): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return guard(parsed) ? parsed : null;
    } catch {
      return null; // corrupt / unavailable storage → caller seeds a default
    }
  }

  function save(value: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors (private mode, quota exceeded)
    }
  }

  function clear(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }

  return {
    key,
    read,
    save,
    clear,
    load() {
      return read() ?? clone(seed());
    },
    reseed() {
      clear();
      return clone(seed());
    },
  };
}
