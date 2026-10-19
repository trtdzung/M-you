import type { ReactNode } from "react";
import { bottomBar } from "./styles";

/** Sticky bottom area holding the screen's single primary action (+ optional secondary). */
export function BottomActions({ children }: { children: ReactNode }) {
  return <div className={bottomBar}>{children}</div>;
}
