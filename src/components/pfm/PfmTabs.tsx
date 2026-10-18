import { LayoutGrid, ArrowLeftRight, Wallet, Target, type LucideIcon } from "lucide-react";

/**
 * PFM navigation config — the four bottom-nav destinations of the BIDV-style
 * wallet IA (plan 260910-1626): Tổng quan · Giao dịch · Ngân sách · Mục tiêu, with
 * a center ＋ FAB (Thêm giao dịch) rendered separately by `PfmBottomNav`. This
 * SUPERSEDES the 3 segmented top-tabs (Tổng quan/Hũ/Dòng tiền) of plan 260908.
 *
 * The host still switches panels client-side by `id` (no navigation, no refetch);
 * only the presentation moved to a bottom nav. `isPfmTab`/`PfmTabId` stay the
 * shared contract imported by the host + panels.
 */
export const PFM_TABS = [
  { id: "overview", label: "Tổng quan", icon: LayoutGrid },
  { id: "transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { id: "budget", label: "Ngân sách", icon: Wallet },
  { id: "goals", label: "Mục tiêu", icon: Target },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

/**
 * Panels the host still renders but the bottom nav no longer shows: `settings`
 * ("Hũ & danh mục") gave its nav slot to Mục tiêu and is opened from Ngân sách
 * (`BudgetTab` links to `?tab=settings`), so those links keep working.
 */
export const PFM_LINKED_PANELS = ["settings"] as const;

export type PfmTabId = (typeof PFM_TABS)[number]["id"] | (typeof PFM_LINKED_PANELS)[number];

export function isPfmTab(value: string | null | undefined): value is PfmTabId {
  return (
    !!value &&
    (PFM_TABS.some((t) => t.id === value) || (PFM_LINKED_PANELS as readonly string[]).includes(value))
  );
}

/**
 * Legacy tab ids from the 3-tab IA (plan 260908/260909) redirect to the new IA so
 * old deep links + copilot jumps never dead-end (invariant #3): `hu` → the budget
 * tab (số dư→hạn mức lens), `cashflow` → overview (Dòng tiền folded in, phase 04).
 */
export function resolveLegacyTab(tab: string | null | undefined): PfmTabId | null {
  if (tab === "hu") return "budget";
  if (tab === "cashflow") return "overview";
  return null;
}

/** Tab query for the wallet nav. Leaving Hũ & danh mục drops `hu`, so a hidden panel cannot reopen its editor. */
export function withPfmTab(current: URLSearchParams, id: PfmTabId): string {
  const next = new URLSearchParams(current.toString());
  next.set("tab", id);
  next.delete("dock");
  next.delete("setup");
  if (id !== "settings") next.delete("hu");
  return next.toString();
}
