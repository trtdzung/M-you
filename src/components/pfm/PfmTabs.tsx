import { LayoutGrid, ArrowLeftRight, Wallet, Settings, type LucideIcon } from "lucide-react";

/**
 * PFM navigation config — the four bottom-nav destinations of the BIDV-style
 * wallet IA (plan 260910-1626): Tổng quan · Giao dịch · Ngân sách · Cài đặt, with
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
  { id: "settings", label: "Cài đặt", icon: Settings },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type PfmTabId = (typeof PFM_TABS)[number]["id"];

export function isPfmTab(value: string | null | undefined): value is PfmTabId {
  return !!value && PFM_TABS.some((t) => t.id === value);
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
