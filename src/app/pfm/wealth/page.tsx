import { redirect } from "next/navigation";

/**
 * Redirect stub (Red Team C4): the Tài sản content now lives in the single-route
 * PFM host. This deep-link resolves to the tab; it renders no view of its own.
 */
export default function PfmWealthRedirect() {
  redirect("/pfm?tab=wealth");
}
