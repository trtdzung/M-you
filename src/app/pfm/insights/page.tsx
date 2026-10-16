import { redirect } from "next/navigation";

/**
 * Legacy redirect stub: the standalone Gợi ý tab was folded away. The Trợ lý tab
 * itself was later removed (3-tab reformat) — the assistant now lives at its own
 * route, and the full insights feed is its empty-state doorway. Sending this old
 * deep-link to `?tab=assistant` would silently fall back to Tổng quan, so it
 * resolves to `/assistant` directly (red-team #6).
 */
export default function PfmInsightsRedirect() {
  redirect("/assistant");
}
