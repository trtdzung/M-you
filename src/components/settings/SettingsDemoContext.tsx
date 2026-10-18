"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type DemoState = {
  faceId: boolean;
  advanced: boolean;
  passwordUpdated: boolean;
  balanceNotifications: boolean;
  offers: boolean;
  appearance: "anniversary" | "simple";
  widgets: string[];
  // Scam Shield (simulated, session only)
  aiProtect: boolean;
  familyAlerts: boolean;
  securityTips: boolean;
  antiPhishingCode: string | null;
  emergencyContacts: EmergencyContact[];
  trustedContacts: TrustedContact[];
  transferLockUntil: number | null;
  accountLocked: boolean;
  accountLockedAt: number | null;
  /** When (ms) a requested "turn off" takes effect; lowering security waits 24h. */
  pendingOff: Partial<Record<"aiProtect" | "antiPhishing", number>>;
};
export type EmergencyContact = { id: string; name: string; relation: string; phone: string; status: "pending" | "active" | "removing"; removeAt?: number };
export type TrustedContact = { id: string; name: string; bank: string; account: string };
const TRUSTED_SAMPLE: TrustedContact[] = [
  { id: "trusted-1", name: "NGUYEN THU HA", bank: "MSB", account: "••• 2291" },
  { id: "trusted-2", name: "TRAN VAN NAM", bank: "Vietcombank", account: "••• 4410" },
  { id: "trusted-3", name: "LE THI MAI", bank: "Techcombank", account: "••• 0835" },
];
const INITIAL: DemoState = { faceId: true, advanced: false, passwordUpdated: false, balanceNotifications: true, offers: true, appearance: "anniversary", widgets: ["Số dư tài khoản", "Chuyển tiền", "Quét QR"], aiProtect: true, familyAlerts: true, securityTips: true, antiPhishingCode: null, emergencyContacts: [], trustedContacts: TRUSTED_SAMPLE, transferLockUntil: null, accountLocked: false, accountLockedAt: null, pendingOff: {} };
const Context = createContext<(DemoState & { update: (patch: Partial<DemoState>) => void }) | null>(null);
/** Non-sensitive display state only. Never stores PINs, passwords or security answers. The anti-phishing code is shown in every MSB message, so it is not a secret. */
export function SettingsDemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(INITIAL);
  return <Context.Provider value={{ ...state, update: patch => setState(previous => ({ ...previous, ...patch })) }}>{children}</Context.Provider>;
}
export function useSettingsDemo() {
  const context = useContext(Context);
  if (!context) throw new Error("SettingsDemoProvider is required");
  return context;
}
