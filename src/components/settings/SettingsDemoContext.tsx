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
};
const INITIAL: DemoState = { faceId: true, advanced: false, passwordUpdated: false, balanceNotifications: true, offers: true, appearance: "anniversary", widgets: ["Số dư tài khoản", "Chuyển tiền", "Quét QR"] };
const Context = createContext<(DemoState & { update: (patch: Partial<DemoState>) => void }) | null>(null);
/** Non-sensitive display state only. Never stores PINs, passwords or security answers. */
export function SettingsDemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(INITIAL);
  return <Context.Provider value={{ ...state, update: patch => setState(previous => ({ ...previous, ...patch })) }}>{children}</Context.Provider>;
}
export function useSettingsDemo() {
  const context = useContext(Context);
  if (!context) throw new Error("SettingsDemoProvider is required");
  return context;
}
