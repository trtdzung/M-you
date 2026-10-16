import { PhoneShell } from "@/components/shell/PhoneShell";

/**
 * Calm PFM-style surface (blush base + soft peach wash), reused here so the
 * confirm + success receipt match the reference screenshot's plain chrome
 * instead of the festive photo background every other top-level screen uses.
 * Duplicated from `transfer/layout.tsx`'s `CalmBg` — not worth extracting yet.
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
 * Chrome for `/transfer-confirm`: calm peach surface, no bottom nav — a
 * focused task-flow continuation of `/transfer`, not a tab-bar destination.
 * Moved out of the `(festive)` group (was previously nested there, inheriting
 * the busy festive photo + the global 3-tab `BottomNav`) specifically because
 * that floating nav sat UNDER the fold and overlapped the "Xác nhận chuyển
 * tiền" button — a real user's tap could land on the nav's "Cài đặt" tab
 * instead of confirming. `shell-calm` retints the status ink to navy.
 */
export default function TransferConfirmLayout({
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
