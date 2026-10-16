import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";
import { cn } from "@/lib/cn";

/**
 * Logical app canvas — chrome-agnostic. Owns the device frame (440×956 on
 * desktop, real viewport on mobile), `StatusBar`, and the scrolling
 * `main`. Skin is injected by each route-group layout via slots: `background`
 * (the `-z-10` layer), plus optional `nav` / `fab`. This is what lets the festive
 * and calm PFM groups carry different chrome without a conditional mega-shell.
 *
 * `className` decorates the device canvas (e.g. `shell-calm` to retint status ink,
 * or a desktop shadow to lift the frame); `mainClassName` swaps the `main` padding
 * variant (e.g. `shell-main--pfm`); `stageClassName` decorates the desktop stage
 * behind the canvas (e.g. a neutral backdrop so a same-colour surface stands out).
 */
export function PhoneShell({
  children,
  background,
  nav,
  fab,
  className,
  mainClassName,
  stageClassName,
}: {
  children: ReactNode;
  background?: ReactNode;
  nav?: ReactNode;
  fab?: ReactNode;
  className?: string;
  mainClassName?: string;
  stageClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[100dvh] items-center justify-center bg-background lg:p-4",
        stageClassName,
      )}
    >
      <div
        id="device-canvas"
        className={cn(
          "device-canvas relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-transparent lg:rounded-screen",
          className,
        )}
      >
        {background}
        <StatusBar />
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
