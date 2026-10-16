import { PhoneShell } from "@/components/shell/PhoneShell";
import { AssistantAppBar } from "@/components/assistant/AssistantAppBar";
import { AssistantTrustStrip } from "@/components/assistant/AssistantTrustStrip";

/**
 * Warm assistant surface: quiet peach ground + a subtle wash under the app-bar.
 * No photo — financial chat reads on a calm ground, matching the PFM chrome split.
 */
function WarmBg() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 bg-surface-muted" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-primary-soft/40 to-transparent"
      />
    </>
  );
}

/**
 * Chrome for `/assistant`: its own thin orange app-bar + trust strip, then a
 * full-height column that hands the remaining space to the chat. Deliberately NO
 * bottom nav and NO AI FAB (the FAB already self-hides here). `shell-main--assistant`
 * zeros the main padding so the app-bar and docked composer own the edges. Status
 * ink stays white (default) over the cam app-bar — no `shell-calm`.
 */
export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell background={<WarmBg />} mainClassName="shell-main--assistant">
      <div className="flex h-full flex-col">
        <AssistantAppBar />
        <AssistantTrustStrip />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </PhoneShell>
  );
}
