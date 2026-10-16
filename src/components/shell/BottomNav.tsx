"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ArrowLeftRight,
  TrendingUp,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; icon: LucideIcon };

const TABS: Tab[] = [
  { href: "/", label: "Tổng quan", icon: LayoutGrid },
  { href: "/transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { href: "/cashflow", label: "Dòng tiền", icon: TrendingUp },
  { href: "/wealth", label: "Tài sản", icon: Wallet },
  { href: "/assistant", label: "Trợ lý", icon: Sparkles },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Floating pill nav chuẩn MSB — nổi cách đáy, tab active = pill peach + cam. */
export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Điều hướng chính"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-3"
    >
      <ul className="shadow-nav pointer-events-auto flex w-full items-stretch justify-between gap-0.5 rounded-full bg-surface px-2 py-1.5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  active
                    ? "bg-primary-soft text-primary-strong"
                    : "text-muted hover:text-text",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                <span className="leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
