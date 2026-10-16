import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";
import { DemoBadge } from "./DemoBadge";
import { cn } from "@/lib/cn";

/**
 * Logical app canvas — chrome-agnostic. Owns the device frame (440×956 on
 * desktop, real viewport on mobile), `StatusBar`, `DemoBadge`, and the scrolling
 * `main`. Skin is injected by each route-group layout via slots: `background`
 * (the `-z-10` layer), plus optional `nav` / `fab`. This is what lets the festive
 * and calm PFM groups carry different chrome without a conditional mega-shell.
 *
 * `className` decorates the device canvas (e.g. `shell-calm` to retint status ink);
 * `mainClassName` swaps the `main` padding variant (e.g. `shell-main--pfm`).
 */
export function PhoneShell({
  children,
  background,
  nav,
  fab,
  className,
  mainClassName,
}: {
  children: ReactNode;
  background?: ReactNode;
  nav?: ReactNode;
  fab?: ReactNode;
  className?: string;
  mainClassName?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background lg:p-4">
      <div
        className={cn(
          "device-canvas relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-transparent lg:rounded-screen",
          className,
        )}
      >
        {background}
        <StatusBar />
        <DemoBadge />
        <main
          id="main-content"
          className={cn(
            "shell-main fade-in min-h-0 flex-1 overflow-y-auto px-shell-main-inset pt-1",
            mainClassName,
          )}
        >
          {children}
        </main>
        {fab}
        {nav}
      </div>
    </div>
  );
}
