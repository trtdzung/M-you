import type { ReactNode } from "react";
import { DeviceOverlay } from "./DeviceOverlay";
import { bottomBar } from "./styles";

/** Sticky bottom area holding the screen's single primary action (+ optional secondary). */
export function BottomActions({ children, docked = false }: { children: ReactNode; docked?: boolean }) {
  if (docked) return <><div aria-hidden className="h-24 shrink-0" /><DeviceOverlay><div style={{ bottom: "calc(104px + var(--safe-area-bottom, 0px))" }} className="absolute inset-x-0 z-20 bg-[linear-gradient(to_top,#f7d4d6_75%,rgba(247,212,214,0))] px-shell-main-inset pb-3 pt-4">{children}</div></DeviceOverlay></>;
  return <div className={bottomBar}>{children}</div>;
}
