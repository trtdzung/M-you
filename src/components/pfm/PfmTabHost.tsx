"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PanelActiveProvider } from "@/components/shell/PanelActive";
import { isPfmTab, resolveLegacyTab, type PfmTabId } from "./PfmTabs";
import { OverviewTab } from "./OverviewTab";
import { BudgetTab } from "@/components/budget/BudgetTab";
import { PfmTxnList } from "@/components/transactions/PfmTxnList";
import { HuCategoryTab } from "@/components/settings/HuCategoryTab";
import { GoalsPreviewApp } from "@/features/goals-preview/GoalsPreviewApp";

/**
 * Single-route PFM host: client-side tab switching with no navigation, no data
 * refetch (`useFinancials` is single-load). The visible panel is driven by `?tab=`
 * — the wallet bottom nav (`PfmBottomNav`, in the layout) replaces the tab param
 * and this host reflects it. Legacy ids from the 3-tab IA (`hu`, `cashflow`, and
 * the `cashflow&dock=hu` combo) resolve forward so old deep links + copilot jumps
 * never dead-end (invariant #3). Each panel owns one scroll region.
 */
export function PfmTabHost() {
  const params = useSearchParams();
  const router = useRouter();
  const tabParam = params?.get("tab");
  const dockParam = params?.get("dock");
  // Legacy `?tab=cashflow&dock=hu` (Hũ was a Dòng tiền dock) → the budget tab.
  const isLegacyHuDock = tabParam === "cashflow" && dockParam === "hu";

  const resolve = useCallback(
    (raw: string | null | undefined): PfmTabId =>
      isLegacyHuDock ? "budget" : resolveLegacyTab(raw) ?? (isPfmTab(raw) ? raw : "overview"),
    [isLegacyHuDock],
  );

  const initial = resolve(tabParam);
  const [active, setActive] = useState<PfmTabId>(initial);
  const [visited, setVisited] = useState<PfmTabId[]>([initial]);
  const scrollTops = useRef<Partial<Record<PfmTabId, number>>>({});
  const panelEls = useRef<Partial<Record<PfmTabId, HTMLDivElement | null>>>({});

  // Re-sync on same-route jumps (bottom nav, copilot deep link): `useState` seeds
  // only at mount, so a `?tab=` change while already on `/pfm` must update here.
  // A resolved legacy id is also normalized back into the URL so the address bar
  // never keeps a retired param.
  useEffect(() => {
    const next = resolve(tabParam);
    if (isLegacyHuDock || (resolveLegacyTab(tabParam) && tabParam !== next)) {
      router.replace(`/pfm?tab=${next}`, { scroll: false });
    }
    setActive((current) => (current === next ? current : next));
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
  }, [tabParam, isLegacyHuDock, resolve, router]);

  useLayoutEffect(() => {
    const el = panelEls.current[active];
    if (!el) return;
    const saved = scrollTops.current[active];
    if (saved != null) el.scrollTop = saved;
    const onScroll = () => {
      scrollTops.current[active] = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      // `hidden` can zero scrollTop. Keep the last position captured while the panel was visible.
      if (!el.hidden) scrollTops.current[active] = el.scrollTop;
    };
  }, [active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {PFM_PANELS.map(({ id, node }) => {
          const shown = id === active;
          if (!visited.includes(id)) return null;
          return (
            <PanelActiveProvider key={id} active={shown}>
              <div
                role="tabpanel"
                id={`pfm-panel-${id}`}
                aria-labelledby={`pfm-tab-${id}`}
                hidden={!shown}
                ref={(el) => {
                  panelEls.current[id] = el;
                }}
                className="no-scrollbar h-full min-h-0 min-w-0 overflow-x-hidden overscroll-x-none overflow-y-auto scroll-pb-6 pb-6"
              >
                {node()}
              </div>
            </PanelActiveProvider>
          );
        })}
      </div>
    </div>
  );
}

const PFM_PANELS: { id: PfmTabId; node: () => React.ReactNode }[] = [
  { id: "overview", node: () => <OverviewTab /> },
  { id: "transactions", node: () => <PfmTxnList /> },
  { id: "budget", node: () => <BudgetTab /> },
  { id: "goals", node: () => <GoalsPreviewApp embedded /> },
  { id: "settings", node: () => <HuCategoryTab /> },
];
