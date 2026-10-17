import type { JarBurnForecast } from "@/domain/engine/jar-burn-forecast";
import type { InvestmentFeatures } from "@/domain/engine/investment-nudge";
import { investmentFeaturesSnapshot } from "@/domain/engine/investment-nudge";

// ─── shared types ─────────────────────────────────────────────────────────────

export interface AgentInsightNarrative {
  snapshot_id: string;
  explanation: string;
  suggested_action: string;
}

/**
 * Extended narrative for investment nudge — the agent also tells us WHICH
 * MSB product to surface (if any). The widget renders the product card from
 * this, never from hardcoded thresholds.
 */
export interface AgentInvestmentNarrative extends AgentInsightNarrative {
  /**
   * The MSB product the agent decided to recommend, or null when the agent
   * determines the user's profile does not yet warrant a product pitch.
   */
  product_id: "m-sinh-loi" | "tiet-kiem" | null;
}

// ─── product catalogue (UI metadata only — NO selection logic here) ───────────

export const INVESTMENT_PRODUCTS = {
  "m-sinh-loi": {
    id: "m-sinh-loi" as const,
    label: "M – Sinh lời",
    features: ["Tự động sinh lời", "Sinh lời hơn mỗi ngày", "Linh hoạt rút tiền 24/7"],
    ctaLabel: "Xem thêm",
    ctaUrl: "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/",
  },
  "tiet-kiem": {
    id: "tiet-kiem" as const,
    label: "Chứng chỉ tiền gửi MSB",
    features: ["Sinh lời đến 6,9%/năm", "Linh hoạt chuyển nhượng", "Giao dịch online an toàn, thuận tiện"],
    ctaLabel: "Đăng ký",
    ctaUrl: "https://www.msb.com.vn/khach-hang-ca-nhan/dau-tu/",
  },
} as const;

export type InvestmentProductId = keyof typeof INVESTMENT_PRODUCTS;

// ─── cache / dedup ────────────────────────────────────────────────────────────

const CACHE_MS = 5 * 60 * 1000;
const jarCache = new Map<string, { value: AgentInsightNarrative; until: number }>();
const investCache = new Map<string, { value: AgentInvestmentNarrative; until: number }>();
const inFlight = new Map<string, Promise<AgentInsightNarrative | AgentInvestmentNarrative>>();

// ─── snapshot keys ────────────────────────────────────────────────────────────

/** Stable identifier for jar-burn metrics shown on the warning card. */
export function jarInsightSnapshot(f: JarBurnForecast): string {
  return JSON.stringify([
    f.asOf, f.periodEnd, f.jarId, f.label, f.severity, f.balance,
    f.daysRemaining, f.dailyBurn, f.safeDailySpend, f.daysToEmpty,
    f.projectedShortfall, f.activeDays,
  ]);
}

/** Re-export so the widget can import from one place. */
export { investmentFeaturesSnapshot };

// ─── jar-burn request ─────────────────────────────────────────────────────────

export async function requestJarInsight(
  cif: string,
  f: JarBurnForecast,
): Promise<AgentInsightNarrative> {
  const snapshotId = jarInsightSnapshot(f);
  const key = `jarBurn:${cif}:${snapshotId}`;

  const hit = jarCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const pending = inFlight.get(key) as Promise<AgentInsightNarrative> | undefined;
  if (pending) return pending;

  const task = (async (): Promise<AgentInsightNarrative> => {
    const res = await fetch("/api/agent/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: cif,
        insight_id: `jarBurn:${f.jarId}`,
        snapshot_id: snapshotId,
        trigger_type: "jar_burn",
        as_of: f.asOf,
        metrics: {
          jar_id: f.jarId,
          jar_label: f.label,
          severity: f.severity,
          period_end: f.periodEnd,
          balance: f.balance,
          days_remaining: f.daysRemaining,
          daily_burn: f.dailyBurn,
          safe_daily_spend: f.safeDailySpend,
          days_to_empty: f.daysToEmpty,
          projected_shortfall: f.projectedShortfall,
          active_days: f.activeDays,
          source: f.source,
        },
      }),
    });
    if (!res.ok) throw new Error(`Agent insight unavailable: ${res.status}`);
    const data: unknown = await res.json();
    if (
      !data || typeof data !== "object" ||
      (data as AgentInsightNarrative).snapshot_id !== snapshotId ||
      typeof (data as AgentInsightNarrative).explanation !== "string" ||
      typeof (data as AgentInsightNarrative).suggested_action !== "string" ||
      /[0-9]/.test(`${(data as AgentInsightNarrative).explanation} ${(data as AgentInsightNarrative).suggested_action}`)
    ) throw new Error("Invalid agent insight response");
    const value = data as AgentInsightNarrative;
    jarCache.set(key, { value, until: Date.now() + CACHE_MS });
    return value;
  })();
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}

// ─── investment nudge request ─────────────────────────────────────────────────

export async function requestInvestmentInsight(
  cif: string,
  features: InvestmentFeatures,
): Promise<AgentInvestmentNarrative> {
  const snapshotId = investmentFeaturesSnapshot(features);
  const key = `invest:${cif}:${snapshotId}`;

  const hit = investCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const pending = inFlight.get(key) as Promise<AgentInvestmentNarrative> | undefined;
  if (pending) return pending;

  const task = (async (): Promise<AgentInvestmentNarrative> => {
    const res = await fetch("/api/agent/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: cif,
        insight_id: `invest:${cif}`,
        snapshot_id: snapshotId,
        trigger_type: "investment_nudge",
        as_of: features.as_of,
        metrics: features,
      }),
    });
    if (!res.ok) throw new Error(`Agent insight unavailable: ${res.status}`);
    const data: unknown = await res.json();
    if (
      !data || typeof data !== "object" ||
      (data as AgentInvestmentNarrative).snapshot_id !== snapshotId ||
      typeof (data as AgentInvestmentNarrative).explanation !== "string" ||
      typeof (data as AgentInvestmentNarrative).suggested_action !== "string" ||
      /[0-9]/.test(`${(data as AgentInvestmentNarrative).explanation} ${(data as AgentInvestmentNarrative).suggested_action}`)
    ) throw new Error("Invalid agent investment response");
    // product_id may be null — accept either null or a known product key
    const pid = (data as AgentInvestmentNarrative).product_id;
    if (pid !== null && pid !== "m-sinh-loi" && pid !== "tiet-kiem") {
      throw new Error("Unknown product_id from agent");
    }
    const value = data as AgentInvestmentNarrative;
    investCache.set(key, { value, until: Date.now() + CACHE_MS });
    return value;
  })();
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}
