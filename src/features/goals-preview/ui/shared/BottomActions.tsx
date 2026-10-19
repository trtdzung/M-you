import type { ReactNode } from "react";

/**
 * End-of-page action area: it scrolls with the content (never sticky), so it cannot cover the form.
 * Rule for every screen: one primary button, at most one secondary; on/off goes into a Switch,
 * rare or destructive actions become a small text link.
 */
export function BottomActions({ children }: { children: ReactNode; inline?: boolean }) {
  return <div className="mt-2 flex flex-col gap-2 pb-[calc(16px+var(--safe-area-bottom,0px))]">{children}</div>;
}
