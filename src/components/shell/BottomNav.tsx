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

export function BottomNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Điều hướng chính"
      className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur sm:rounded-b-[28px]"
    >
      <ul className="flex items-stretch justify-around px-1 pb-2 pt-1.5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted hover:text-text",
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
