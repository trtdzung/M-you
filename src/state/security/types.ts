// Scam Shield state shapes. Simulated data only; never PINs, passwords or OTPs.

import type { PendingOff } from "@/components/settings/security/pending";

export type EmergencyContact = { id: string; name: string; relation: string; phone: string; status: "pending" | "active" | "removing"; removeAt?: number };
export type TrustedContact = { id: string; name: string; bank: string; account: string };

/** One M-You warning and what the customer chose. `at` is ms since epoch. */
export type AlertLogEntry = { id: string; at: number; level: "yellow" | "red"; situation: string; choice: string; note?: string };

/** Persisted Scam Shield state (one copy per persona). */
export type SecurityState = {
  aiProtect: boolean;
  familyAlerts: boolean;
  securityTips: boolean;
  /** Shown in every MSB message, so it is not a secret. */
  antiPhishingCode: string | null;
  emergencyContacts: EmergencyContact[];
  trustedContacts: TrustedContact[];
  transferLockUntil: number | null;
  accountLocked: boolean;
  accountLockedAt: number | null;
  /** When (ms) a requested "turn off" takes effect; lowering security waits 24h. */
  pendingOff: PendingOff;
  alertLog: AlertLogEntry[];
};
