import type { ReactNode } from "react";
import { DeviceOverlay } from "./DeviceOverlay";
import { bottomBar } from "./styles";

/**
 * Bottom area holding the screen's single primary action (+ optional secondary).
 * Sticky by default; `inline` puts it at the end of the content so it scrolls with it.
 */
export function BottomActions({ children, docked = false, inline = false }: { children: ReactNode; docked?: boolean; inline?: boolean }) {
  if (inline) return <div className="mt-2 flex flex-col gap-2 pb-[calc(16px+var(--safe-area-bottom,0px))]">{children}</div>;
  if (docked) return <><div aria-hidden className="h-24 shrink-0" /><DeviceOverlay><div style={{ bottom: "calc(104px + var(--safe-area-bottom, 0px))" }} className="absolute inset-x-0 z-20 bg-[linear-gradient(to_top,#f7d4d6_75%,rgba(247,212,214,0))] px-shell-main-inset pb-3 pt-4">{children}</div></DeviceOverlay></>;
  return <div className={bottomBar}>{children}</div>;
}
