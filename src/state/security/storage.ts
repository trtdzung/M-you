// The only Scam Shield code that touches localStorage. Later: swap for the
// security API without changing the store. Every access is guarded (SSR,
// private mode, quota).

import type { StateStorage } from "zustand/middleware";

export const SECURITY_STORAGE_PREFIX = "msb-pfm.security.v1";

// Active persona; null = no persona yet, so reads miss and writes are dropped.
let activeCif: string | null = null;

export function setSecurityCif(cif: string | null): void {
  activeCif = cif;
}

export function securityStorageKey(cif: string): string {
  return `${SECURITY_STORAGE_PREFIX}.${cif}`;
}

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** zustand `StateStorage` keyed by the active persona (the persist `name` is ignored). */
export const securityStorage: StateStorage = {
  getItem: () => {
    if (!activeCif) return null;
    try {
      return local()?.getItem(securityStorageKey(activeCif)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (_name, value) => {
    if (!activeCif) return;
    try {
      local()?.setItem(securityStorageKey(activeCif), value);
    } catch {
      // ignore storage errors
    }
  },
  removeItem: () => {
    if (activeCif) clearSecurityStorage(activeCif);
  },
};

/** Remove one persona's saved state, or every persona's when `cif` is omitted (logout). */
export function clearSecurityStorage(cif?: string): void {
  const storage = local();
  if (!storage) return;
  try {
    if (cif) {
      storage.removeItem(securityStorageKey(cif));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(`${SECURITY_STORAGE_PREFIX}.`)) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
  } catch {
    // ignore storage errors
  }
}
