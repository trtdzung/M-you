import { notFound } from "next/navigation";
import { SettingsDemo } from "@/components/settings/SettingsDemo";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/components/settings/settings-sections";

export default async function SettingsDetailPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SETTINGS_SECTIONS.includes(section as SettingsSection)) notFound();
  return <SettingsDemo section={section as SettingsSection} />;
}
