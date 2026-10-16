import { redirect } from "next/navigation";

/**
 * Redirect stub: Dòng tiền is folded into Tổng quan in the BIDV 4-tab IA (plan
 * 260910-1626). This legacy deep-link resolves to the overview tab; it renders no
 * view of its own.
 */
export default function PfmCashflowRedirect() {
  redirect("/pfm?tab=overview");
}
