"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { PhoneShell } from "@/components/shell/PhoneShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { VoiceFab } from "@/components/pfm/VoiceFab";

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
 * Chrome for every non-PFM route (Home / accounts / settings / transfer / …):
 * festive photo surface + 3-tab MSB `BottomNav`, plus a floating M-You agent icon
 * (`VoiceFab floating`) that opens the voice section. `useSearchParams` inside it
 * needs a Suspense boundary on these statically-rendered pages.
 */
export default function FestiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const home = pathname === "/";
  const settings = pathname?.startsWith("/settings");
  const settingsDetail = settings && pathname !== "/settings";
  return (
    <PhoneShell
      className={settings ? "shell-calm settings-shell" : home ? "login-shell home-shell" : undefined}
      mainClassName={settingsDetail ? "settings-main-detail" : undefined}
      background={settings ? <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#fce0d5] to-[#fbd0d4]" /> : home ? <div aria-hidden className="login-background absolute inset-0 -z-10" /> : <FestiveBg />}
      nav={settingsDetail ? undefined : <BottomNav />}
      fab={
        !settings && !home && <Suspense fallback={null}>
          <VoiceFab floating />
        </Suspense>
      }
    >
      {children}
    </PhoneShell>
  );
}
