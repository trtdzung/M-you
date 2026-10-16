import { redirect } from "next/navigation";

/**
 * Redirect stub (3-tab reformat): Hũ is now a top-level tab, not a Dòng tiền
 * dock. This legacy path resolves to the Hũ tab. No view of its own; no money
 * movement. See plans/260909-2254-pfm-3tab-reformat/.
 */
export default function PfmJarsRedirect() {
  redirect("/pfm?tab=hu");
}
