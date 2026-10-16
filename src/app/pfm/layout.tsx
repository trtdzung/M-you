import { PhoneShell } from "@/components/shell/PhoneShell";
import { PfmBottomNav } from "@/components/pfm/PfmBottomNav";
import { PfmHeader } from "@/components/pfm/PfmHeader";
import { MYourWidget } from "@/components/pfm/MYourWidget";

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
        className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-surface-tint/80 to-transparent"
      />
    </>
  );
}

/**
 * Chrome for `/pfm/*`: the calm surface, a `PfmHeader` back-arrow sub-app header,
 * and the BIDV-style wallet `PfmBottomNav` (4 tabs + center ＋ FAB). This
 * SUPERSEDES the no-bottom-nav decision of plan 260908 (the 3 segmented top-tabs)
 * — the user chose the 4-tab + FAB IA. `shell-calm` retints the status ink to
 * navy; `shell-main--pfm` reserves bottom-nav clearance for the panel content.
 * `MYourWidget` rides the `fab` slot (same corner as the festive `AssistantFab`,
 * which self-hides inside `/pfm`) so the M-Your chat entry point floats above
 * the bottom nav on every PFM screen without touching the center ＋ FAB.
 */
export default function PfmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell
      background={<CalmBg />}
      nav={<PfmBottomNav />}
      fab={<MYourWidget />}
      className="shell-calm lg:shadow-[0_24px_70px_-24px_rgba(31,42,68,0.45)] lg:ring-1 lg:ring-black/[0.06]"
      mainClassName="shell-main--pfm"
      stageClassName="lg:bg-stone-200"
    >
      <div className="pfm-shell flex h-full flex-col">
        <PfmHeader />
        {children}
      </div>
    </PhoneShell>
  );
}
