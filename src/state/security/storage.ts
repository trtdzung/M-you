// Scam Shield persistence: the store saves through the security profile API
// (`/api/security/profile`, SQLite), so the rule engine and the fraud agent
// read the same state the app shows. localStorage is only read once per
// persona to carry an older browser-only copy up to the server.

import type { StateStorage } from "zustand/middleware";

export const SECURITY_STORAGE_PREFIX = "msb-pfm.security.v1";

const API_PATH = "/api/security/profile";
const WRITE_DELAY_MS = 300;
// zustand persist wraps the state as `{ state, version }`; the server keeps only `state`.
const PERSIST_VERSION = 1;

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

function readLegacy(cif: string): string | null {
  try {
    return local()?.getItem(securityStorageKey(cif)) ?? null;
  } catch {
    return null;
  }
}

function stateOf(persisted: string): unknown {
  try {
    return (JSON.parse(persisted) as { state?: unknown }).state ?? null;
  } catch {
    return null;
  }
}

async function putState(cif: string, state: unknown, keepalive = false): Promise<boolean> {
  try {
    const res = await fetch(API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif, state }),
      keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Writes are debounced per persona; a switch or page hide flushes the last one.
const queued = new Map<string, { state: unknown; timer: ReturnType<typeof setTimeout> }>();

function flush(cif: string, keepalive = false): void {
  const entry = queued.get(cif);
  if (!entry) return;
  clearTimeout(entry.timer);
  queued.delete(cif);
  void putState(cif, entry.state, keepalive);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => [...queued.keys()].forEach(cif => flush(cif, true)));
}

/** zustand `StateStorage` keyed by the active persona (the persist `name` is ignored). */
export const securityStorage: StateStorage = {
  getItem: async () => {
    const cif = activeCif;
    if (!cif || typeof window === "undefined") return null;
    try {
      const res = await fetch(`${API_PATH}?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
      if (!res.ok) return null;
      const { state } = (await res.json()) as { state: unknown };
      if (state) return JSON.stringify({ state, version: PERSIST_VERSION });
      // Nothing on the server yet: carry this browser's older copy up once.
      const legacy = readLegacy(cif);
      const legacyState = legacy ? stateOf(legacy) : null;
      if (legacy && legacyState && (await putState(cif, legacyState))) return legacy;
      return null;
    } catch {
      return null;
    }
  },
  setItem: (_name, value) => {
    const cif = activeCif;
    if (!cif) return;
    const state = stateOf(value);
    if (!state) return;
    const previous = queued.get(cif);
    if (previous) clearTimeout(previous.timer);
    queued.set(cif, { state, timer: setTimeout(() => flush(cif), WRITE_DELAY_MS) });
  },
  removeItem: () => {
    if (activeCif) clearSecurityStorage(activeCif);
  },
};

/**
 * Remove this browser's older local copy for one persona, or for every persona
 * when `cif` is omitted (logout). The server copy is shared and kept.
 */
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
