import { PhoneShell } from "@/components/shell/PhoneShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { AssistantFab } from "@/components/shell/AssistantFab";

/**
 * Festive shell: the full-screen 2/9 (Quốc khánh) photo background + bottom scrim.
 * Fixed inside the device frame — only `main` scrolls; the scrim keeps text
 * legible over the darker lower region of the photo.
 */
function FestiveBg() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[url('/bg-2-9.png')] bg-cover bg-top"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent to-black/20"
      />
    </>
  );
}

/**
 * Chrome for every non-PFM route (Home / accounts / settings / assistant /
 * transfer / …): festive photo surface, 3-tab MSB `BottomNav`, floating AI FAB.
 */
export default function FestiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PhoneShell background={<FestiveBg />} nav={<BottomNav />} fab={<AssistantFab />}>
      {children}
    </PhoneShell>
  );
}
