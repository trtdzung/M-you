import { PhoneShell } from "@/components/shell/PhoneShell";
import { AssistantFab } from "@/components/shell/AssistantFab";
import { PfmHeader } from "@/components/pfm/PfmHeader";

/**
 * Calm PFM surface: blush base + a soft peach→transparent wash at the top. No
 * photo — financial cards read on a quiet ground instead of a busy background.
 */
function CalmBg() {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 bg-background" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-primary-soft/70 to-transparent"
      />
    </>
  );
}

/**
 * Chrome for `/pfm/*`: the calm surface, a `PfmHeader` back-arrow sub-app header,
 * and the restyled AI FAB. Deliberately NO bottom nav — the 4 segmented tabs
 * inside the page are the sole PFM navigation. `shell-calm` retints the status
 * ink to navy; `shell-main--pfm` drops the reserved bottom-nav clearance.
 */
export default function PfmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell
      background={<CalmBg />}
      fab={<AssistantFab />}
      className="shell-calm"
      mainClassName="shell-main--pfm"
    >
      <div className="pfm-shell flex h-full flex-col">
        <PfmHeader />
        {children}
      </div>
    </PhoneShell>
  );
}
