import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";
import { DemoBadge } from "./DemoBadge";

/**
 * Logical app canvas. Mobile fills its real visual viewport; desktop uses the
 * canonical 440×956 iPhone 17 Pro Max comparison canvas without simulated
 * device hardware. Short desktop windows uniformly scale the full canvas.
 */
export function PhoneShell({
  children,
  nav,
  fab,
}: {
  children: ReactNode;
  nav?: ReactNode;
  fab?: ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background lg:p-4">
      <div className="device-canvas relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background lg:rounded-screen">
        <StatusBar />
        <DemoBadge />
        <main id="main-content" className="shell-main fade-in min-h-0 flex-1 overflow-y-auto px-shell-main-inset pt-1">
          {children}
        </main>
        {fab}
        {nav}
      </div>
    </div>
  );
}
