import { PhoneShell } from "@/components/shell/PhoneShell";

/**
 * Calm PFM-style surface (blush base + soft peach wash), reused here so
 * Chuyển tiền matches the reference screenshot's chrome instead of the
 * festive photo background every other top-level screen uses. Duplicated
 * from `pfm/layout.tsx`'s `CalmBg` — two call sites, not worth extracting yet.
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
 * Chrome for `/transfer`: calm peach surface, own back-arrow header (per
 * screen, not shared `ScreenHeader`) matching the reference chrome exactly,
 * no bottom nav — this is a focused task flow, not a tab-bar destination
 * (same reasoning as `/assistant`). `shell-calm` retints the status ink to
 * navy to read on the light peach ground.
 */
export default function TransferLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell background={<CalmBg />} className="shell-calm" mainClassName="shell-main--transfer">
      {children}
    </PhoneShell>
  );
}
