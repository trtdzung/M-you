import type { ReactNode } from "react";
import { HomeHeader } from "@/components/shell/HomeHeader";

/** Keep Home controls in place while only the content below them scrolls. */
export function HomePageFrame({ children, notifications = 0 }: { children: ReactNode; notifications?: number }) {
  return <div className="flex h-full min-h-0 flex-col">
    <div className="shrink-0"><HomeHeader notifications={notifications} /></div>
    <div className="no-scrollbar -mx-shell-main-inset min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-shell-main-inset">
      {children}
    </div>
  </div>;
}
