"use client";

import type { ShieldSection as Section } from "../settings-sections";
import { AlertLogScreen } from "./screens/AlertLogScreen";
import { AntiPhishingScreen } from "./screens/AntiPhishingScreen";
import { EmergencyContactsScreen } from "./screens/EmergencyContactsScreen";
import { ProtectScreen } from "./screens/ProtectScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { SosScreen } from "./screens/SosScreen";
import { TransferLockScreen } from "./screens/TransferLockScreen";
import { TrustedContactsScreen } from "./screens/TrustedContactsScreen";

const SCREENS: Record<Section, () => React.JSX.Element> = {
  protect: ProtectScreen,
  "anti-phishing": AntiPhishingScreen,
  "emergency-contacts": EmergencyContactsScreen,
  "trusted-contacts": TrustedContactsScreen,
  "transfer-lock": TransferLockScreen,
  scan: ScanScreen,
  "alert-log": AlertLogScreen,
  sos: SosScreen,
};

/** Picks the Scam Shield screen for a settings section. */
export function ShieldSection({ section }: { section: Section }) {
  const Screen = SCREENS[section];
  return <Screen />;
}
