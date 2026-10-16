import { redirect } from "next/navigation";

/**
 * Legacy route (Red Team M5): redirect to the dedicated Tài sản & Nợ manager,
 * which now lives at `/pfm/wealth` (shipped by the IA redesign). Old `/wealth`
 * bookmarks land on the real wealth surface, not the cockpit.
 */
export default function WealthRedirect() {
  redirect("/pfm/wealth");
}
