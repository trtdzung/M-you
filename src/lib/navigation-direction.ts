const FESTIVE_TABS = new Set(["/", "/accounts", "/settings", "/transactions"]);

const SECURITY_CHILDREN = new Set([
  "pin",
  "password",
  "face",
  "devices",
  "signature",
  "advanced",
  "knowledge",
  "protect",
  "anti-phishing",
  "emergency-contacts",
  "trusted-contacts",
  "transfer-lock",
  "scan",
  "lookup",
  "case",
  "sos",
  "test-tools",
]);

function pathnameOf(href: string): string {
  const query = href.indexOf("?");
  const path = query === -1 ? href : href.slice(0, query);
  return path || "/";
}

function settingsSection(pathname: string): string | null {
  if (pathname === "/settings" || !pathname.startsWith("/settings/")) return null;
  return pathname.slice("/settings/".length).split("/")[0] || null;
}

/** Where the in-app back control on a settings detail screen goes. */
export function settingsParent(pathname: string): string | null {
  const section = settingsSection(pathname);
  if (!section) return null;
  if (section === "questions") return "/settings/advanced";
  if (section === "alert-log") return "/settings/protect";
  if (SECURITY_CHILDREN.has(section)) return "/settings/security";
  return "/settings";
}

/**
 * Home tabs (Trang chủ / Tài khoản / Cài đặt) crossfade. Pushed screens slide
 * forward; their back control slides back. Query-only changes (`?tab=`) stay instant.
 */
export function navigationDirection(fromHref: string, toHref: string): "forward" | "back" | "fade" | "none" {
  const from = pathnameOf(fromHref);
  const to = pathnameOf(toHref);
  if (from === to) return "none";
  if (FESTIVE_TABS.has(from) && FESTIVE_TABS.has(to)) return "fade";

  if (from.startsWith("/settings") && to.startsWith("/settings")) {
    if (to === settingsParent(from)) return "back";
    if (from === settingsParent(to)) return "forward";
    if (from === "/settings") return "forward";
    if (to === "/settings") return "back";
  }

  if (from === "/accounts" && to.startsWith("/accounts/")) return "forward";
  if (to === "/accounts" && from.startsWith("/accounts/")) return "back";

  if (from === "/transfer" && to.startsWith("/transfer-confirm")) return "forward";
  if (from.startsWith("/transfer-confirm") && (to === "/transfer" || to === "/")) return "back";
  if (from === "/transfer" && to === "/") return "back";
  if (to === "/transfer") return "forward";

  if ((from === "/pfm" || from.startsWith("/pfm/")) && to.startsWith("/goals")) return "forward";
  if (from.startsWith("/goals") && (to === "/pfm" || to === "/")) return "back";
  if (from.startsWith("/goals/") && to.startsWith("/goals/") && from !== to) return "forward";

  if (FESTIVE_TABS.has(from) && (to === "/pfm" || to.startsWith("/pfm/") || to.startsWith("/goals"))) return "forward";
  if ((from === "/pfm" || from.startsWith("/pfm/")) && to === "/") return "back";
  if (from === "/pfm" && to.startsWith("/pfm/")) return "forward";
  if (from.startsWith("/pfm/") && to === "/pfm") return "back";

  if (to.startsWith(`${from}/`)) return "forward";
  if (from.startsWith(`${to}/`)) return "back";
  return "forward";
}

/**
 * Left-edge swipe follows the screen's back control.
 * Root tabs stay put. Transfer uses history, same as its header.
 */
export function edgeBackHref(pathname: string): string | "history" | null {
  if (FESTIVE_TABS.has(pathname) || pathname === "/pfm") return null;
  const settings = settingsParent(pathname);
  if (settings) return settings;
  if (pathname.startsWith("/accounts/")) return "/accounts";
  if (pathname.startsWith("/goals")) return "/pfm?tab=goals";
  if (pathname === "/transfer" || pathname.startsWith("/transfer-confirm")) return "history";
  if (pathname.startsWith("/pfm/")) return "/";
  return null;
}
