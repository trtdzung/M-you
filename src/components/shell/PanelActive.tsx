"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Sheets outside a PFM tab are active. A hidden tab sets this to false so its portal cannot cover the visible tab. */
const PanelActiveContext = createContext(true);

export function PanelActiveProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <PanelActiveContext.Provider value={active}>{children}</PanelActiveContext.Provider>;
}

export function usePanelActive(): boolean {
  return useContext(PanelActiveContext);
}
