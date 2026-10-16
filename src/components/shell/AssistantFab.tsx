"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

/**
 * FAB Trợ lý AI — nổi xuyên các màn (quyết định #2), đặt trên bottom nav, phía
 * phải, tránh safe-area. Ẩn khi đang ở `/assistant`. Nút tròn cam gradient.
 */
export function AssistantFab() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/assistant") return null;

  return (
    <div className="shell-fab pointer-events-none absolute right-5 z-20 flex justify-end">
      <Link
        href="/assistant"
        aria-label="Trợ lý AI"
        className="brand-gradient pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-primary-fg shadow-nav transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
      >
        <Sparkles size={26} strokeWidth={2} className="drop-shadow-sm" />
      </Link>
    </div>
  );
}
