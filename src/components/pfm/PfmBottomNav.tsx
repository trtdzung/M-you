"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { PFM_TABS, resolveLegacyTab, type PfmTabId } from "./PfmTabs";
import { VoiceFab } from "./VoiceFab";

/**
 * BIDV-style wallet bottom nav for `/pfm/*` (plan 260910-1626): 4 destinations —
 * Tổng quan · Giao dịch · (M-You) · Ngân sách · Cài đặt — with a raised center
 * agent icon (`VoiceFab`, Feature 5; a second copy floats on the main screen).
 * Pinned to the
 * device-canvas bottom via the PhoneShell `nav` slot (same pattern as the
 * festive `BottomNav`), so it never scrolls with panel content and both navs
 * can coexist without overlap.
 *
 * Navigation is URL-driven (`?tab=`): a tap replaces the tab param and the
 * single-route `PfmTabHost` switches the visible panel client-side with no
 * refetch (`useFinancials` is keyed on persona, not tab). Active state reads the
 * same param, resolving legacy tab ids (`hu`/`cashflow` + `dock=hu`) so old deep
 * links never dead-end (invariant #3). The center icon is split into positions 2|3.
 */
export function PfmBottomNav() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params?.get("tab") ?? null;
  const dockParam = params?.get("dock") ?? null;
  const active: PfmTabId =
    (tabParam === "cashflow" && dockParam === "hu" ? "budget" : null) ??
    resolveLegacyTab(tabParam) ??
    (PFM_TABS.some((t) => t.id === tabParam) ? (tabParam as PfmTabId) : "overview");

  function go(id: PfmTabId) {
    const next = new URLSearchParams(params?.toString());
    next.set("tab", id);
    next.delete("dock");
    next.delete("setup");
    router.replace(`/pfm?${next.toString()}`, { scroll: false });
  }

  const left = PFM_TABS.slice(0, 2);
  const right = PFM_TABS.slice(2);

  return (
    <nav
      aria-label="Điều hướng PFM"
      className="shell-bottom-nav pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-shell-main-inset"
    >
      <div className="shadow-nav pointer-events-auto relative flex w-full items-stretch justify-between gap-1 rounded-full border border-surface/60 bg-surface/80 px-2 py-2 backdrop-blur-xl">
        {left.map((tab) => (
          <NavItem key={tab.id} tab={tab} active={tab.id === active} onSelect={() => go(tab.id)} />
        ))}
        <div className="flex w-16 shrink-0 items-center justify-center" aria-hidden />
        {right.map((tab) => (
          <NavItem key={tab.id} tab={tab} active={tab.id === active} onSelect={() => go(tab.id)} />
        ))}
        <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center">
          <VoiceFab />
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  tab,
  active,
  onSelect,
}: {
  tab: (typeof PFM_TABS)[number];
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      id={`pfm-tab-${tab.id}`}
      aria-controls={`pfm-panel-${tab.id}`}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        active ? "bg-primary-soft text-primary" : "text-muted hover:text-text",
      )}
    >
      <Icon
        size={22}
        strokeWidth={active ? 2.4 : 1.8}
        className={active ? "text-primary" : "text-text"}
        {...(active ? { fill: "currentColor", fillOpacity: 0.14 } : {})}
      />
      <span className="leading-none">{tab.label}</span>
    </button>
  );
}
