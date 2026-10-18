import { PhoneShell } from "@/components/shell/PhoneShell";

// Calm surface (blush base + soft peach wash), same as /transfer.
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

/** Chrome for `/goals`: calm surface, own header per screen, no bottom nav. */
export default function GoalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell background={<CalmBg />} className="shell-calm" mainClassName="shell-main--goals no-scrollbar overflow-x-hidden">
      {children}
    </PhoneShell>
  );
}
