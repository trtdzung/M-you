import { redirect } from "next/navigation";

/**
 * Legacy route (Red Team M5): redirect DIRECTLY to the PFM tab param, avoiding a
 * double server-redirect chain through `/pfm/wealth`.
 */
export default function WealthRedirect() {
  redirect("/pfm?tab=wealth");
}
