"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { StoredCategory, Transaction } from "@/domain/models";
import type { Financials } from "@/domain/engine/finance-compose";
import { forecastJarBurn } from "@/domain/engine/jar-burn-forecast";
import { extractInvestmentFeatures, type InvestmentFeatures } from "@/domain/engine/investment-nudge";
import { currentMonthKey, DEMO_NOW } from "@/lib/demo-clock";
import { formatVndCompact } from "@/lib/format";
import {
  jarInsightSnapshot,
  investmentFeaturesSnapshot,
  requestJarInsight,
  requestInvestmentInsight,
  INVESTMENT_PRODUCTS,
  type AgentInsightNarrative,
  type AgentInvestmentNarrative,
} from "@/lib/insight-api";

/**
 * One current-month insight card, right below the account card.
 *
 * Priority:
 *  1. Jar-burn WARNING — any variable jar is forecast to run dry.
 *  2. Investment NUDGE — safe, with investable surplus. Agent decides the product.
 *  3. Monitoring FALLBACK — no trigger, nothing to surface.
 */
export function HomeInsightWidget({
  financials, transactions, categories, cif,
}: {
  financials: Financials;
  transactions: Transaction[];
  categories: StoredCategory[];
  cif: string;
}) {
  const isCurrentMonth = financials.monthKey === currentMonthKey();

  // ── Priority 1: jar-burn ───────────────────────────────────────────────────
  const forecast = useMemo(
    () => isCurrentMonth
      ? forecastJarBurn(financials, transactions, categories, DEMO_NOW)
      : null,
    [financials, transactions, categories, isCurrentMonth],
  );

  // ── Priority 2: investment nudge (only when no burn risk) ─────────────────
  // Feature engineering runs when: current month + no burn risk + pool is known
  const investmentFeatures = useMemo((): InvestmentFeatures | null => {
    if (forecast || !isCurrentMonth) return null;
    const pool = financials.unallocatedPool;
    // Don't even show the card when balance is unknown or zero/negative
    if (pool.amount === "unknown" || pool.amount <= 0) return null;
    return extractInvestmentFeatures(financials, DEMO_NOW);
  }, [forecast, financials, isCurrentMonth]);

  // ── Narrative state ────────────────────────────────────────────────────────
  const jarSnapshotKey = forecast ? `jarBurn:${cif}:${jarInsightSnapshot(forecast)}` : null;
  const investSnapshotKey = investmentFeatures
    ? `invest:${cif}:${investmentFeaturesSnapshot(investmentFeatures)}`
    : null;

  const [jarNarrative, setJarNarrative] = useState<{
    key: string; value: AgentInsightNarrative;
  } | null>(null);

  const [investNarrative, setInvestNarrative] = useState<{
    key: string; value: AgentInvestmentNarrative;
  } | null>(null);

  // Investment card shows while agent is loading (deterministic content first)
  const [investLoading, setInvestLoading] = useState(false);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!forecast || !jarSnapshotKey) return;
    let active = true;
    requestJarInsight(cif, forecast)
      .then((value) => { if (active) setJarNarrative({ key: jarSnapshotKey, value }); })
      .catch(() => { /* deterministic card is fully useful without agent */ });
    return () => { active = false; };
  }, [cif, forecast, jarSnapshotKey]);

  useEffect(() => {
    if (!investmentFeatures || !investSnapshotKey) return;
    let active = true;
    setInvestLoading(true);
    requestInvestmentInsight(cif, investmentFeatures)
      .then((value) => {
        if (active) {
          setInvestNarrative({ key: investSnapshotKey, value });
          setInvestLoading(false);
        }
      })
      .catch(() => { if (active) setInvestLoading(false); });
    return () => { active = false; };
  }, [cif, investmentFeatures, investSnapshotKey]);

  // ── Render: Priority 1 — jar-burn warning ─────────────────────────────────
  if (forecast) {
    const agent =
      jarNarrative?.key === jarSnapshotKey ? jarNarrative.value : null;
    return (
      <section
        aria-label="Thông tin tài chính từ M-Your"
        className="shadow-card rounded-[24px] border border-white/50 bg-white/85 p-4 text-text backdrop-blur-xl"
        data-testid="home-insight-widget"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <TrendingDown size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">M-Your · Dự báo chi tiêu</p>
            <h2 className="mt-0.5 text-base font-bold leading-snug">
              Hũ {forecast.label} có thể hết trước cuối tháng
            </h2>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed">
          Hũ còn {formatVndCompact(forecast.balance)} cho {forecast.daysRemaining} ngày.
          Với mức chi gần đây, hũ có thể hết sau khoảng {forecast.daysToEmpty} ngày.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-surface-muted px-3 py-2">
            <p className="text-xs text-muted">Chi gần đây</p>
            <p className="font-semibold">{formatVndCompact(forecast.dailyBurn)}/ngày</p>
          </div>
          <div className="rounded-xl bg-primary-soft px-3 py-2">
            <p className="text-xs text-muted">Để đủ đến cuối tháng</p>
            <p className="font-semibold text-primary">
              {formatVndCompact(forecast.safeDailySpend)}/ngày
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          {agent?.explanation ??
            "Ước tính từ chi tiêu linh hoạt đã ghi nhận trong 7 và 30 ngày gần đây."}
        </p>
        {agent?.suggested_action && (
          <p className="mt-2 text-sm font-medium leading-relaxed text-text">
            {agent.suggested_action}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted">Ước tính · dữ liệu demo</span>
          <Link
            href="/pfm?tab=budget"
            className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Xem hũ <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  // ── Render: Priority 2 — investment nudge ──────────────────────────────────
  if (investmentFeatures) {
    const agentResult =
      investNarrative?.key === investSnapshotKey ? investNarrative.value : null;
    const product =
      agentResult?.product_id != null
        ? INVESTMENT_PRODUCTS[agentResult.product_id]
        : null;

    return (
      <section
        aria-label="Thông tin tài chính từ M-Your"
        className="shadow-card rounded-[24px] border border-white/50 bg-white/85 p-4 text-text backdrop-blur-xl"
        data-testid="home-insight-widget"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
            <TrendingUp size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">M-Your · Gợi ý đầu tư</p>
            <h2 className="mt-0.5 text-base font-bold leading-snug">
              Bạn có tiền nhàn rỗi — hãy để nó sinh lời
            </h2>
          </div>
          {investLoading && (
            <Loader2 size={16} className="mt-1 shrink-0 animate-spin text-muted" aria-label="Đang phân tích" />
          )}
        </div>

        {/* Agent explanation or fallback */}
        <p className="mt-3 text-sm leading-relaxed">
          {agentResult?.explanation ??
            "M-Your đang phân tích bức tranh tài chính của bạn để đưa ra gợi ý phù hợp nhất."}
        </p>

        {/* Product card — only when agent has decided */}
        {product && (
          <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{product.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {product.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-muted">
                      <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-positive" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Suggested action from agent */}
        {agentResult?.suggested_action && (
          <p className="mt-3 text-sm font-medium leading-relaxed text-text">
            {agentResult.suggested_action}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted">Phân tích · dữ liệu demo</span>
          {product ? (
            <a
              href={product.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {product.ctaLabel} <ArrowRight size={16} aria-hidden />
            </a>
          ) : (
            <Link
              href="/pfm"
              className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Tổng quan <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      </section>
    );
  }

  // ── Render: Priority 3 — monitoring fallback ──────────────────────────────
  return (
    <section
      aria-label="Thông tin tài chính từ M-Your"
      className="shadow-card rounded-[24px] border border-white/50 bg-white/85 p-4 text-text backdrop-blur-xl"
      data-testid="home-insight-widget"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Sparkles size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-primary">M-Your · Góc nhìn tài chính</p>
          <h2 className="mt-0.5 text-base font-bold leading-snug">Chưa có cảnh báo hũ sắp cạn</h2>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">
        PFM đang theo dõi chi tiêu trong các hũ và sẽ báo khi có đủ tín hiệu một hũ có thể hết trước cuối tháng.
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">Ước tính · dữ liệu demo</span>
        <Link
          href="/pfm?tab=budget"
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Xem hũ <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
