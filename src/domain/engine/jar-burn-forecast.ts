import type { StoredCategory, Transaction } from "@/domain/models";
import type { Financials } from "./finance-compose";
import { netExpenseByCategory } from "./cashflow";
import { dateToMonthKey, VN_UTC_OFFSET_MS, type Period } from "./types";

const DAY_MS = 86_400_000;
const MIN_ACTIVE_DAYS = 3;

export interface JarBurnForecast {
  jarId: string;
  label: string;
  severity: "attention" | "urgent";
  asOf: string;
  periodEnd: string;
  balance: number;
  daysRemaining: number;
  dailyBurn: number;
  safeDailySpend: number;
  daysToEmpty: number;
  projectedShortfall: number;
  activeDays: number;
  source: "estimated";
}

function recentPeriod(now: Date, days: number): Period {
  const vn = new Date(now.getTime() + VN_UTC_OFFSET_MS);
  const todayStartUtc = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_UTC_OFFSET_MS;
  return {
    from: new Date(todayStartUtc - (days - 1) * DAY_MS).toISOString(),
    to: now.toISOString(),
    label: `last-${days}-days`,
  };
}

/**
 * Uses the exact spend selector behind jarBudget. Jars containing a fixed
 * category are skipped until scheduled bills can be projected per jar; a rent
 * payment early in the month must not be projected every day, and an unpaid bill
 * must not be mistaken for spare daily spending.
 */
export function forecastJarBurn(
  financials: Financials,
  transactions: Transaction[],
  categories: StoredCategory[],
  now: Date,
): JarBurnForecast | null {
  if (!Number.isFinite(now.getTime()) || financials.monthKey !== dateToMonthKey(now)) return null;
  const daysRemaining = financials.jarBudget.summary.daysLeft;
  if (daysRemaining <= 0) return null;

  const fixed = new Set(categories.filter((c) => c.fixed).map((c) => c.id));
  const last7 = recentPeriod(now, 7);
  const last30 = recentPeriod(now, 30);
  const spend7 = netExpenseByCategory(transactions, last7);
  const spend30 = netExpenseByCategory(transactions, last30);
  const candidates: JarBurnForecast[] = [];

  for (const line of financials.jarBudget.lines) {
    if (line.remaining === null || !Number.isFinite(line.remaining) || line.remaining <= 0) continue;
    if (line.categoryIds.length === 0 || line.categoryIds.some((id) => fixed.has(id))) continue;
    const variableIds = line.categoryIds;
    const amount7 = variableIds.reduce((sum, id) => sum + (spend7.get(id) ?? 0), 0);
    const amount30 = variableIds.reduce((sum, id) => sum + (spend30.get(id) ?? 0), 0);
    const dailyBurn = Math.max(0, 0.6 * Math.max(0, amount7) / 7 + 0.4 * Math.max(0, amount30) / 30);
    if (dailyBurn <= 0) continue;

    // Sparse, one-off purchases should not produce a confident daily runway.
    const activeDays = new Set(transactions.filter((t) => {
      const posted = Date.parse(t.postedAt);
      return t.status === "posted" &&
        (t.type === "expense" || t.type === "fee") &&
        variableIds.includes(t.categoryId) &&
        Number.isFinite(posted) &&
        posted >= Date.parse(last30.from) && posted <= now.getTime();
    }).map((t) => Math.floor((Date.parse(t.postedAt) + VN_UTC_OFFSET_MS) / DAY_MS))).size;
    if (activeDays < MIN_ACTIVE_DAYS) continue;

    const projectedSpend = dailyBurn * daysRemaining;
    const projectedShortfall = Math.round(projectedSpend - line.remaining);
    if (projectedShortfall <= 0) continue;

    const ratio = projectedSpend / line.remaining;
    candidates.push({
      jarId: line.huId,
      label: line.label,
      severity: ratio >= 1.2 ? "urgent" : "attention",
      asOf: now.toISOString(),
      periodEnd: financials.jarBudget.meta.period.to,
      balance: Math.round(line.remaining),
      daysRemaining,
      dailyBurn: Math.round(dailyBurn),
      safeDailySpend: Math.floor(line.remaining / daysRemaining),
      // Floor keeps the displayed day strictly before the period end whenever
      // this detector fires (ceil could say "10 days" with 10 days left).
      daysToEmpty: Math.max(1, Math.floor(line.remaining / dailyBurn)),
      projectedShortfall,
      activeDays,
      source: "estimated",
    });
  }

  return candidates.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "urgent" ? -1 : 1;
    return b.projectedShortfall - a.projectedShortfall;
  })[0] ?? null;
}
