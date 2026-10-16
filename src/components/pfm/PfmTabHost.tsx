"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PfmTabs, isPfmTab, type PfmTabId } from "./PfmTabs";
import { OverviewTab } from "./OverviewTab";
import { CashflowView } from "@/components/cashflow/CashflowView";
import { WealthView } from "@/components/wealth/WealthView";
import { InsightsView } from "@/components/insights/InsightsView";

/**
 * Single-route PFM host: client-side tab switching with no navigation, no data
 * refetch (`useFinancials` is single-load). Initial tab comes from `?tab=` for
 * deep links. The Tổng quan panel is locked to one non-scrolling viewport
 * (overflow-hidden); the three feature panels scroll within their own region.
 */
export function PfmTabHost() {
  const params = useSearchParams();
  const initial = params?.get("tab");
  const [active, setActive] = useState<PfmTabId>(isPfmTab(initial) ? initial : "overview");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PfmTabs active={active} onChange={setActive} />

      <div className="min-h-0 flex-1 pt-3">
        {PFM_PANELS.map(({ id, node }) => {
          const shown = id === active;
          const scrollable = id !== "overview";
          return (
            <div
              key={id}
              role="tabpanel"
              id={`pfm-panel-${id}`}
              aria-labelledby={`pfm-tab-${id}`}
              hidden={!shown}
              className={
                scrollable
                  ? "h-full overflow-y-auto pb-6"
                  : "h-full overflow-hidden"
              }
            >
              {shown && node(setActive)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PFM_PANELS: { id: PfmTabId; node: (nav: (t: PfmTabId) => void) => React.ReactNode }[] = [
  { id: "overview", node: (nav) => <OverviewTab onNavigate={nav} /> },
  { id: "cashflow", node: () => <CashflowView /> },
  { id: "wealth", node: () => <WealthView /> },
  { id: "insights", node: () => <InsightsView /> },
];
