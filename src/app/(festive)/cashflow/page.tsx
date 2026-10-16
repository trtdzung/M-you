import { redirect } from "next/navigation";

/**
 * Legacy route (Red Team M5): redirect DIRECTLY to the PFM tab param, avoiding a
 * double server-redirect chain through `/pfm/cashflow`.
 */
export default function CashflowRedirect() {
  redirect("/pfm?tab=cashflow");
}
