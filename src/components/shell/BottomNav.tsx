"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; icon: LucideIcon; match: string[] };

/**
 * 3-tab MSB IA khớp ref-ui-msb: Trang chủ · Tài khoản · Cài đặt. PFM truy cập
 * từ tile PFM trên lưới quick-action Home. Giao dịch tổng hợp thuộc tab Tài khoản.
 */
const TABS: Tab[] = [
  { href: "/", label: "Trang chủ", icon: Home, match: [] },
  { href: "/accounts", label: "Tài khoản", icon: Wallet, match: ["/accounts", "/transactions"] },
  { href: "/settings", label: "Cài đặt", icon: Settings, match: ["/settings"] },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.href === "/") return pathname === "/";
  return tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

/** Floating pill nav chuẩn MSB — nổi cách đáy, tab active = pill peach + cam. */
export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Điều hướng chính"
      className="shell-bottom-nav pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-shell-main-inset"
    >
      <ul className="shadow-nav pointer-events-auto flex w-full items-stretch justify-between gap-1 rounded-full border border-white/40 bg-white/70 px-2 py-2 backdrop-blur-xl">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:text-text",
                )}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 1.8}
                  className={active ? "text-primary" : "text-text"}
                  {...(active ? { fill: "currentColor", fillOpacity: 0.14 } : {})}
                />
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
