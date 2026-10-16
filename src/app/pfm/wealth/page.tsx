import { WealthManager } from "@/components/wealth/WealthManager";

/**
 * Tài sản & Nợ manual manager (Phase 03). Previously a redirect stub; now the
 * dedicated CRUD surface for self-reported assets & liabilities and the drill
 * target the Tổng quan summary links to. Old links to `/pfm/wealth` land here.
 */
export default function PfmWealthPage() {
  return <WealthManager />;
}
