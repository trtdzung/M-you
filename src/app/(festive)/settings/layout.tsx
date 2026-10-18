import { SettingsDemoProvider } from "@/components/settings/SettingsDemoContext";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsDemoProvider>{children}</SettingsDemoProvider>;
}
