"use client";

// Scam Shield store (zustand, client only). Actions carry the business rules:
// raising security applies at once, lowering it waits 24h (`pendingOff`,
// contact "removing"). The store never reads React context; components pass in
// what it needs. Persisted per persona through `storage.ts`.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { transferNow } from "@/lib/demo-clock";
import { DAY_MS, withoutPending, type PendingOff } from "@/components/settings/security/pending";
import { SECURITY_DEFAULTS } from "./defaults";
import { securityStorage, setSecurityCif } from "./storage";
import type { AlertLogEntry, EmergencyContact, SecurityState, TrustedContact } from "./types";

export const MAX_EMERGENCY_CONTACTS = 2;

type OffKey = keyof PendingOff;

type SecurityActions = {
  /** Turning on applies now; turning off becomes a 24h request. */
  setAiProtect: (on: boolean, now?: number) => void;
  requestOff: (key: OffKey, now?: number) => void;
  cancelOff: (key: OffKey) => void;
  /** Applies a requested "turn off" (the demo simulates the 24h wait). */
  applyOff: (key: OffKey) => void;
  saveAntiPhishingCode: (code: string) => void;
  addEmergencyContact: (input: { name: string; relation: string; phone: string }) => void;
  approveContact: (id: string) => void;
  requestRemoveContact: (id: string, now?: number) => void;
  cancelRemoveContact: (id: string) => void;
  applyRemoveContact: (id: string) => void;
  removeTrustedContact: (id: string) => void;
  addTrustedContact: (input: Omit<TrustedContact, "id">) => void;
  /** Locking applies at once; unlocking early is `requestOff("transferLock")`. */
  lockTransfers: (days: number, now?: number) => void;
  /** Locking applies at once; unlocking is `requestOff("accountLock")`. */
  lockAccount: (now?: number) => void;
  setFamilyAlerts: (on: boolean) => void;
  setSecurityTips: (on: boolean) => void;
  logAlert: (entry: Omit<AlertLogEntry, "id" | "at"> & { at?: number }) => void;
  reset: () => void;
  /** Point storage at `cif`, reset to defaults, then load that persona's saved state. */
  switchPersona: (cif: string | null) => Promise<void>;
};

export type SecurityStore = SecurityState & SecurityActions & { hasHydrated: boolean };

// What each requested decrease changes once it takes effect.
const OFF_CHANGES: Record<OffKey, Partial<SecurityState>> = {
  aiProtect: { aiProtect: false },
  antiPhishing: { antiPhishingCode: null },
  transferLock: { transferLockUntil: null },
  accountLock: { accountLocked: false, accountLockedAt: null },
};

const clockNow = () => transferNow().getTime();
const newId = () => crypto.randomUUID();
const sameName = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

export const useSecurityStore = create<SecurityStore>()(persist((set, get) => {
  const mapContacts = (id: string, change: (contact: EmergencyContact) => EmergencyContact) =>
    set(state => ({ emergencyContacts: state.emergencyContacts.map(contact => contact.id === id ? change(contact) : contact) }));
  const dropContact = (id: string) => set(state => ({ emergencyContacts: state.emergencyContacts.filter(contact => contact.id !== id) }));

  return {
    ...SECURITY_DEFAULTS,
    hasHydrated: false,

    setAiProtect: (on, now = clockNow()) => {
      if (on) set(state => ({ aiProtect: true, pendingOff: withoutPending(state.pendingOff, "aiProtect") }));
      else get().requestOff("aiProtect", now);
    },
    requestOff: (key, now = clockNow()) => set(state => ({ pendingOff: { ...state.pendingOff, [key]: now + DAY_MS } })),
    cancelOff: key => set(state => ({ pendingOff: withoutPending(state.pendingOff, key) })),
    applyOff: key => set(state => ({ ...OFF_CHANGES[key], pendingOff: withoutPending(state.pendingOff, key) })),
    saveAntiPhishingCode: code => set(state => ({ antiPhishingCode: code, pendingOff: withoutPending(state.pendingOff, "antiPhishing") })),

    addEmergencyContact: input => set(state => state.emergencyContacts.length >= MAX_EMERGENCY_CONTACTS ? state
      : { emergencyContacts: [...state.emergencyContacts, { ...input, id: newId(), status: "pending" }] }),
    approveContact: id => mapContacts(id, contact => ({ ...contact, status: "active" })),
    requestRemoveContact: (id, now = clockNow()) => {
      const contact = get().emergencyContacts.find(item => item.id === id);
      // Not yet accepted = never protected anyone, so it goes at once.
      if (contact?.status === "pending") dropContact(id);
      else mapContacts(id, item => ({ ...item, status: "removing", removeAt: now + DAY_MS }));
    },
    cancelRemoveContact: id => mapContacts(id, contact => ({ ...contact, status: "active", removeAt: undefined })),
    applyRemoveContact: dropContact,

    removeTrustedContact: id => set(state => ({ trustedContacts: state.trustedContacts.filter(contact => contact.id !== id) })),
    addTrustedContact: input => set(state => state.trustedContacts.some(contact => sameName(contact.name, input.name) && contact.account === input.account) ? state
      : { trustedContacts: [...state.trustedContacts, { ...input, id: newId() }] }),

    // A new lock also drops any unlock request still waiting.
    lockTransfers: (days, now = clockNow()) => set(state => ({ transferLockUntil: now + days * DAY_MS, pendingOff: withoutPending(state.pendingOff, "transferLock") })),
    lockAccount: (now = clockNow()) => set(state => ({ accountLocked: true, accountLockedAt: now, pendingOff: withoutPending(state.pendingOff, "accountLock") })),
    setFamilyAlerts: on => set({ familyAlerts: on }),
    setSecurityTips: on => set({ securityTips: on }),
    logAlert: ({ at = clockNow(), ...entry }) => set(state => ({ alertLog: [...state.alertLog, { ...entry, id: newId(), at }] })),

    reset: () => set({ ...SECURITY_DEFAULTS }),
    switchPersona: async cif => {
      // Detach storage first so the reset is not written over the new persona's data.
      setSecurityCif(null);
      set({ ...SECURITY_DEFAULTS, hasHydrated: false });
      setSecurityCif(cif);
      if (cif) await useSecurityStore.persist.rehydrate();
      set({ hasHydrated: true });
    },
  };
}, {
  name: "msb-pfm.security",
  storage: createJSONStorage(() => securityStorage),
  version: 1,
  skipHydration: true,
  // Data fields only; actions and the hydration flag are never saved.
  partialize: (state): SecurityState => {
    const data = {} as Record<keyof SecurityState, unknown>;
    for (const key of Object.keys(SECURITY_DEFAULTS) as (keyof SecurityState)[]) data[key] = state[key];
    return data as SecurityState;
  },
  // v1 is the first version; anything older or partial falls back to defaults.
  migrate: persisted => ({ ...SECURITY_DEFAULTS, ...(persisted as Partial<SecurityState>) }),
}));
