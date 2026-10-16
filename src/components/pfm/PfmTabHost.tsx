"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PfmTabs, isPfmTab, type PfmTabId } from "./PfmTabs";
import { OverviewTab } from "./OverviewTab";
import { HuTab } from "./HuTab";
import { CashflowChartView } from "@/components/cashflow/CashflowChartView";

/**
 * Single-route PFM host: client-side tab switching with no navigation, no data
 * refetch (`useFinancials` is single-load). The active tab comes from `?tab=` for
 * deep links AND stays in sync with it — a same-route jump (copilot universal
 * jump, P07) updates the visible panel. Each panel owns one scroll region so
 * short viewports and larger text never lose the lower content.
 */
export function PfmTabHost() {
  const params = useSearchParams();
  const router = useRouter();
  const tabParam = params?.get("tab");
  const dockParam = params?.get("dock");
  // Legacy: Hũ used to be a dock inside Dòng tiền (`?tab=cashflow&dock=hu`). It is
  // now a top-level tab, so an old deep link must land on the Hũ tab, never a
  // dead dock (invariant #3). Resolve it before seeding `active`.
  const isLegacyHuDock = tabParam === "cashflow" && dockParam === "hu";
  const [active, setActive] = useState<PfmTabId>(
    isLegacyHuDock ? "hu" : isPfmTab(tabParam) ? tabParam : "overview",
  );

  const selectTab = useCallback(
    (next: PfmTabId) => {
      setActive(next);
      const nextParams = new URLSearchParams(params?.toString());
      nextParams.set("tab", next);
      nextParams.delete("dock");
      nextParams.delete("setup");
      router.replace(`/pfm?${nextParams.toString()}`, { scroll: false });
    },
    [params, router],
  );

  // Re-sync on same-route jumps (red-team #1): `useState` seeds only at mount, so
  // a `router.push`/`Link` to `?tab=...` while already on `/pfm` would otherwise
  // no-op. Validate `?tab` against the known set (fallback `overview`) and update
  // only when it actually differs from `active`, so this never fights a user tap.
  useEffect(() => {
    if (isLegacyHuDock) {
      setActive("hu");
      router.replace("/pfm?tab=hu", { scroll: false });
      return;
    }
    const next = isPfmTab(tabParam) ? tabParam : "overview";
    setActive((current) => (current === next ? current : next));
  }, [tabParam, isLegacyHuDock, router]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PfmTabs active={active} onChange={selectTab} />

      <div className="min-h-0 flex-1 pt-3">
        {PFM_PANELS.map(({ id, node }) => {
          const shown = id === active;
          return (
            <div
              key={id}
              role="tabpanel"
              id={`pfm-panel-${id}`}
              aria-labelledby={`pfm-tab-${id}`}
              hidden={!shown}
              className="h-full min-h-0 overflow-y-auto scroll-pb-6 pb-6"
            >
              {shown && node(selectTab)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PFM_PANELS: { id: PfmTabId; node: (nav: (t: PfmTabId) => void) => React.ReactNode }[] = [
  { id: "overview", node: (nav) => <OverviewTab onNavigate={nav} /> },
  { id: "hu", node: () => <HuTab /> },
  { id: "cashflow", node: () => <CashflowChartView /> },
];
