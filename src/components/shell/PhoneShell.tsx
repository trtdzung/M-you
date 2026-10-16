import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";

/**
 * Centered "phone" frame on desktop, full-width on mobile.
 * Content scrolls; the bottom nav (passed via `nav`) is sticky to the frame.
 * Adds safe bottom padding so content never hides behind the nav.
 */
export function PhoneShell({
  children,
  nav,
}: {
  children: ReactNode;
  nav?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen justify-center bg-background">
      <div className="relative flex min-h-screen w-full max-w-phone flex-col bg-surface shadow-xl sm:my-4 sm:min-h-[calc(100vh-2rem)] sm:rounded-[28px] sm:border sm:border-border">
        <StatusBar />
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-2">
          {children}
        </main>
        {nav}
      </div>
    </div>
  );
}
