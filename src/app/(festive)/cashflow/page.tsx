import { redirect } from "next/navigation";

/**
 * Legacy route (Red Team M5): redirect DIRECTLY to the PFM tab param, avoiding a
 * double server-redirect chain through `/pfm/cashflow`. Dòng tiền is folded into
 * Tổng quan in the BIDV 4-tab IA (plan 260910-1626).
 */
export default function CashflowRedirect() {
  redirect("/pfm?tab=overview");
}
