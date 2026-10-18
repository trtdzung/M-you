export const SETTINGS_SECTIONS = ["profile", "security", "pin", "password", "face", "advanced", "questions", "devices", "signature", "accounts", "notifications", "appearance", "widgets", "language", "support", "privacy", "knowledge"] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number];
