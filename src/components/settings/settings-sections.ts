export const SHIELD_SECTIONS = ["protect", "anti-phishing", "emergency-contacts", "trusted-contacts", "transfer-lock", "scan", "lookup", "case", "alert-log", "ai-journal", "sos", "test-tools"] as const;
export type ShieldSection = typeof SHIELD_SECTIONS[number];
export function isShieldSection(section: string): section is ShieldSection {
  return (SHIELD_SECTIONS as readonly string[]).includes(section);
}
export const SETTINGS_SECTIONS = ["profile", "security", "pin", "password", "face", "advanced", "questions", "devices", "signature", "accounts", "notifications", "appearance", "widgets", "language", "support", "privacy", "knowledge", ...SHIELD_SECTIONS] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number];
