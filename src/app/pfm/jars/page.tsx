import { redirect } from "next/navigation";

/**
 * Redirect stub: the Hũ setup now lives on the Ngân sách tab (hạn mức/tháng theo
 * hũ) of the BIDV 4-tab IA (plan 260910-1626). This legacy path resolves there.
 * No view of its own; no money movement.
 */
export default function PfmJarsRedirect() {
  redirect("/pfm?tab=budget");
}
