"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isPfmTab, resolveLegacyTab, type PfmTabId } from "./PfmTabs";
import { OverviewTab } from "./OverviewTab";
import { BudgetTab } from "@/components/budget/BudgetTab";
import { PfmTxnList } from "@/components/transactions/PfmTxnList";
import { HuCategoryTab } from "@/components/settings/HuCategoryTab";

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

  const [active, setActive] = useState<PfmTabId>(() => resolve(tabParam));

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
  }, [tabParam, isLegacyHuDock, resolve, router]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
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
              {shown && node()}
            </div>
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
  { id: "settings", node: () => <HuCategoryTab /> },
];
