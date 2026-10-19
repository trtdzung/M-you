"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { pushWithTransition } from "@/lib/view-transition";
import { Sheet } from "@/components/primitives/Sheet";
import {
  ChevronRight,
  Sparkles,
  CheckCircle2,
  CalendarClock,
  TrendingDown,
  AlertTriangle,
  Target,
  TrendingUp,
  Activity,
  Trophy,
  ShieldCheck,
} from "lucide-react";
import { formatVnd } from "@/lib/format";
import { usePersona } from "@/providers/context";
import { useAssetLiabilities } from "@/state/assets";
import { useGoals } from "@/state/goals";
import { useJarConfig } from "@/state/jars";
import { useCorrections } from "@/state/corrections";
import { useManualTxns } from "@/state/manual-txns";
import {
  type HomeInsight,
  type HomeInsightCarouselResult,
  type InsightCategory,
  type InsightTone,
  CATEGORY_META,
} from "@/insights/proactive/home-contract";
import { saveInsightDraft } from "@/insights/proactive/chat-handoff";
import { HandbookSheet } from "@/components/security/HandbookSheet";

import { useAppToday } from "@/state/app-clock";

const TOTAL_SLIDES = 3;

function getCategoryVisuals(category?: InsightCategory, tone?: InsightTone) {
  const meta = category ? CATEGORY_META[category] : undefined;
  const effectiveTone = tone ?? meta?.defaultTone ?? "info";

  const toneClasses: Record<InsightTone, {
    pill: string;
    dot: string;
    iconBg: string;
    iconText: string;
  }> = {
    urgent: {
      pill: "bg-red-50 text-red-700 border-red-200/80",
      dot: "bg-red-500",
      iconBg: "bg-red-50",
      iconText: "text-red-600",
    },
    warning: {
      pill: "bg-amber-50 text-amber-800 border-amber-200/80",
      dot: "bg-amber-500",
      iconBg: "bg-amber-50",
      iconText: "text-amber-700",
    },
    positive: {
      pill: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
      dot: "bg-emerald-500",
      iconBg: "bg-emerald-50",
      iconText: "text-emerald-700",
    },
    info: {
      pill: "bg-blue-50 text-blue-800 border-blue-200/80",
      dot: "bg-blue-500",
      iconBg: "bg-blue-50",
      iconText: "text-blue-700",
    },
    security: {
      pill: "bg-teal-50 text-teal-800 border-teal-200/80",
      dot: "bg-teal-500",
      iconBg: "bg-teal-50",
      iconText: "text-teal-700",
    },
  };

  return toneClasses[effectiveTone];
}

export function formatCandidateMetric(metric: { label: string; value: number; unit?: string }): string {
  if (metric.unit === "points" || metric.label.toLowerCase().includes("điểm")) {
    return `${metric.value}/100 điểm`;
  }
  if (metric.unit === "percent") {
    return `${metric.value}%`;
  }
  if (metric.unit === "count") {
    return `${metric.value}`;
  }
  if (metric.unit && metric.unit !== "VND") {
    return `${metric.value} ${metric.unit}`;
  }
  return formatVnd(metric.value);
}

function CategoryIcon({
  category,
  tone,
  size = 16,
  className = "",
}: {
  category?: InsightCategory;
  tone?: InsightTone;
  size?: number;
  className?: string;
}) {
  if (tone === "security" || category === "DISCOVERY_GUIDE") {
    return <ShieldCheck size={size} className={className} aria-hidden />;
  }
  switch (category) {
    case "UPCOMING_OBLIGATION":
      return <CalendarClock size={size} className={className} aria-hidden />;
    case "CASHFLOW_RISK":
      return <TrendingDown size={size} className={className} aria-hidden />;
    case "ANOMALY_LEAKAGE":
      return <AlertTriangle size={size} className={className} aria-hidden />;
    case "GOAL_PROGRESS":
      return <Target size={size} className={className} aria-hidden />;
    case "OPTIMIZATION":
      return <TrendingUp size={size} className={className} aria-hidden />;
    case "PERIODIC_PULSE":
      return <Activity size={size} className={className} aria-hidden />;
    case "RECOGNITION_RECAP":
      return <Trophy size={size} className={className} aria-hidden />;
    default:
      return <Sparkles size={size} className={className} aria-hidden />;
  }
}

export function HomeInsightWidget() {
  const today = useAppToday();
  const { persona } = usePersona();
  const profile = useAssetLiabilities();
  const goals = useGoals();
  const jars = useJarConfig();
  const corrections = useCorrections();
  const { manualTxns } = useManualTxns();
  const router = useRouter();

  const [data, setData] = useState<{ key: string; result: HomeInsightCarouselResult } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  // Carousel state
  const [activeSlide, setActiveSlide] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);

  // Sheets state
  const [sheetMode, setSheetMode] = useState<"none" | "fallback" | "insight_0" | "insight_1" | "insight_2">("none");
  const [handbookOpen, setHandbookOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetMode("none"), []);

  const ready = jars.loaded && corrections.loaded && !corrections.unsaved;
  const payload = JSON.stringify({
    cif: persona.cif,
    profile: {
      assets: profile.assets,
      liabilities: profile.liabilities,
      goals: goals.goals,
      complete: !profile.dropped && !goals.dropped,
    },
  });
  const revision = JSON.stringify([jars.config, corrections.corrections, manualTxns]);
  const resultKey = payload + revision;
  const requestIdentity = JSON.stringify([ready, payload, revision, refresh]);
  const previousRequestIdentity = useRef<string | null>(null);

  const currentResult = data?.key === resultKey && ready ? data.result : null;
  const insights: HomeInsight[] = currentResult?.insights ?? (currentResult?.insight ? [currentResult.insight] : []);

  useEffect(() => {
    const focus = () => setRefresh((n) => n + 1);
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const clockOnly = previousRequestIdentity.current === requestIdentity;
    previousRequestIdentity.current = requestIdentity;
    if (!clockOnly) {
      setSheetMode("none");
      setActiveSlide(0);
    }

    if (!ready) return () => controller.abort();

    const deadline = setTimeout(() => {
      controller.abort();
      if (!clockOnly) setData(null);
      setError("Chưa tải được gợi ý. Thử lại");
      setLoading(false);
    }, 30_300);

    const timer = setTimeout(() => {
      void fetch("/api/proactive-insights/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("unavailable");
          const resJson: HomeInsightCarouselResult = await response.json();
          if (controller.signal.aborted) return;
          setData({ key: resultKey, result: resJson });

          // Fire displayed event once for the snapshot
          if (resJson.snapshotId) {
            void fetch("/api/proactive-insights/current", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cif: persona.cif,
                snapshotId: resJson.snapshotId,
                event: "displayed",
              }),
            }).catch(() => {});
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            if (!clockOnly) setData(null);
            setError("Chưa tải được gợi ý. Thử lại");
          }
        })
        .finally(() => {
          clearTimeout(deadline);
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [ready, payload, resultKey, refresh, persona.cif, today, requestIdentity]);

  const prevSlide = useCallback(() => {
    setActiveSlide((curr) => (curr > 0 ? curr - 1 : TOTAL_SLIDES - 1));
  }, []);

  const nextSlide = useCallback(() => {
    setActiveSlide((curr) => (curr < TOTAL_SLIDES - 1 ? curr + 1 : 0));
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevSlide();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextSlide();
    }
  };

  const onDragStart = (clientX: number) => {
    startXRef.current = clientX;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setDragOffset(0);
  };

  const onDragMove = (clientX: number) => {
    if (!isDraggingRef.current || startXRef.current === null) return;
    const diff = clientX - startXRef.current;
    if (Math.abs(diff) > 5) {
      hasMovedRef.current = true;
      setIsSwiping(true);
      if ((activeSlide === 0 && diff > 0) || (activeSlide === TOTAL_SLIDES - 1 && diff < 0)) {
        setDragOffset(diff * 0.25);
      } else {
        setDragOffset(diff);
      }
    }
  };

  const onDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsSwiping(false);

    if (dragOffset < -40 && activeSlide < TOTAL_SLIDES - 1) {
      setActiveSlide((prev) => prev + 1);
    } else if (dragOffset > 40 && activeSlide > 0) {
      setActiveSlide((prev) => prev - 1);
    }
    setDragOffset(0);
    setTimeout(() => {
      hasMovedRef.current = false;
    }, 120);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    onDragStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    onDragMove(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isDraggingRef.current && startXRef.current !== null && !hasMovedRef.current) {
      const endX = e.changedTouches?.[0]?.clientX;
      if (endX !== undefined) {
        const diff = endX - startXRef.current;
        if (diff < -40 && activeSlide < TOTAL_SLIDES - 1) {
          setActiveSlide((prev) => prev + 1);
        } else if (diff > 40 && activeSlide > 0) {
          setActiveSlide((prev) => prev - 1);
        }
      }
    }
    onDragEnd();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    onDragStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    onDragMove(e.clientX);
  };

  const handleMouseUp = () => {
    onDragEnd();
  };

  const handleMouseLeave = () => {
    if (isDraggingRef.current) {
      onDragEnd();
    }
  };

  const handleCardClick = (action: () => void) => {
    if (hasMovedRef.current) return;
    action();
  };

  function chat(insight: HomeInsight) {
    if (!saveInsightDraft(persona.cif, insight)) {
      setError("Chưa mở được câu hỏi. Vui lòng thử lại.");
      return;
    }
    pushWithTransition((href) => router.push(href), "/pfm?assistant=1&insight=1");
  }

  const handleDismiss = async (snapshotId: string) => {
    closeSheet();
    try {
      await fetch("/api/proactive-insights/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cif: persona.cif,
          snapshotId,
          event: "dismissed",
        }),
      });
      setRefresh((n) => n + 1);
    } catch {}
  };

  // Loading or Error Fallback
  if (!currentResult) {
    return (
      <>
        <section aria-label="Gợi ý tài chính" className="home-insight-card flex items-center">
          <button
            type="button"
            onClick={() => setSheetMode("fallback")}
            className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:outline-primary"
          >
            <Sparkles size={24} className="shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">Gợi ý tài chính</span>
              <span className="block text-xs text-muted">M-Your · Chạm để xem chi tiết</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
          </button>
        </section>
        <Sheet open={sheetMode === "fallback"} title="Gợi ý tài chính" onClose={closeSheet} className="home-insight-sheet">
          <p className="mb-4 text-sm text-muted">
            {error || (loading ? "Đang cập nhật gợi ý tài chính cho bạn." : "Hiện chưa có gợi ý mới cho bạn.")}
          </p>
          {error && (
            <button type="button" onClick={() => setRefresh((n) => n + 1)} className="login-submit">
              Thử lại
            </button>
          )}
          <button
            type="button"
            onClick={() => pushWithTransition((href) => router.push(href), "/pfm")}
            className="home-insight-secondary mt-3"
          >
            Xem tổng quan tài chính
          </button>
        </Sheet>
      </>
    );
  }

  const selectedInsight =
    sheetMode === "insight_0" ? insights[0] :
    sheetMode === "insight_1" ? insights[1] :
    sheetMode === "insight_2" ? insights[2] : null;

  return (
    <>
      <section
        aria-label="Gợi ý tài chính"
        className="home-insight-card relative flex flex-col justify-between overflow-hidden"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Top bar: Carousel Pagination Dots & Slide Counter (No arrow buttons) */}
        <div className="flex items-center justify-between border-b border-orange-100/70 px-4 py-1.5 text-xs">
          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Danh sách slide gợi ý">
            {[0, 1, 2].map((idx) => {
              const isActive = activeSlide === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Chuyển đến slide ${idx + 1}`}
                  onClick={() => setActiveSlide(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    isActive ? "w-5 bg-primary" : "w-1.5 bg-orange-200 hover:bg-orange-300"
                  }`}
                />
              );
            })}
          </div>

          {/* Slide counter */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-muted" aria-live="polite">
              {activeSlide + 1} / {TOTAL_SLIDES}
            </span>
          </div>
        </div>

        {/* Continuous Horizontal Swipe Track */}
        <div
          className="relative w-full cursor-grab active:cursor-grabbing overflow-hidden select-none touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={`flex w-full ${isSwiping ? "" : "transition-transform duration-300 ease-out"}`}
            style={{
              transform: `translateX(calc(-${activeSlide * 100}% + ${dragOffset}px))`,
            }}
          >
            {/* Slide 1 (1/3): Insight 1 */}
            <div className="w-full min-w-full shrink-0">
              <button
                type="button"
                onClick={() => handleCardClick(() => insights[0] && setSheetMode("insight_0"))}
                className="flex min-h-[76px] w-full min-w-0 items-center gap-3 px-4 py-2 text-left focus-visible:outline-primary"
                aria-label={insights[0] ? `Xem insight: ${insights[0].title}` : "Chưa có gợi ý mới"}
              >
                {insights[0] ? (
                  <>
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        getCategoryVisuals(insights[0].category ?? insights[0].candidate.category, insights[0].tone ?? insights[0].candidate.tone).iconBg
                      } ${
                        getCategoryVisuals(insights[0].category ?? insights[0].candidate.category, insights[0].tone ?? insights[0].candidate.tone).iconText
                      }`}
                    >
                      <CategoryIcon
                        category={insights[0].category ?? insights[0].candidate.category}
                        tone={insights[0].tone ?? insights[0].candidate.tone}
                        size={22}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            getCategoryVisuals(insights[0].category ?? insights[0].candidate.category, insights[0].tone ?? insights[0].candidate.tone).pill
                          }`}
                        >
                          <CategoryIcon
                            category={insights[0].category ?? insights[0].candidate.category}
                            tone={insights[0].tone ?? insights[0].candidate.tone}
                            size={10}
                          />
                          <span>
                            {insights[0].categoryLabel ??
                              insights[0].candidate.categoryLabel ??
                              (insights[0].category ? CATEGORY_META[insights[0].category]?.label : "Gợi ý")}
                          </span>
                        </span>
                        {(insights[0].badgeText || insights[0].candidate.badgeText) && (
                          <span className="truncate text-[10px] font-medium text-muted bg-neutral-100/90 px-1.5 py-0.5 rounded">
                            {insights[0].badgeText || insights[0].candidate.badgeText}
                          </span>
                        )}
                      </div>

                      <span className="block truncate text-sm font-semibold text-text">{insights[0].title}</span>

                      {(insights[0].impactLine || insights[0].candidate.impactLine) ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                              getCategoryVisuals(insights[0].category ?? insights[0].candidate.category, insights[0].tone ?? insights[0].candidate.tone).dot
                            }`}
                          />
                          <span className="truncate">{insights[0].impactLine || insights[0].candidate.impactLine}</span>
                        </div>
                      ) : null}

                      <span className="block truncate text-xs text-muted">
                        {insights[0].candidate.metric.label}:{" "}
                        <span className="font-semibold text-text">
                          {formatCandidateMetric(insights[0].candidate.metric)}
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles size={22} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">Chưa có gợi ý mới</span>
                      <span className="block text-xs text-muted">M-Your đang tiếp tục theo dõi tài chính của bạn</span>
                    </div>
                  </>
                )}

                <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
              </button>
            </div>

            {/* Slide 2 (2/3): Insight 2 */}
            <div className="w-full min-w-full shrink-0">
              <button
                type="button"
                onClick={() => handleCardClick(() => insights[1] && setSheetMode("insight_1"))}
                className="flex min-h-[76px] w-full min-w-0 items-center gap-3 px-4 py-2 text-left focus-visible:outline-primary"
                aria-label={insights[1] ? `Xem insight: ${insights[1].title}` : "Chưa có gợi ý mới"}
              >
                {insights[1] ? (
                  <>
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        getCategoryVisuals(insights[1].category ?? insights[1].candidate.category, insights[1].tone ?? insights[1].candidate.tone).iconBg
                      } ${
                        getCategoryVisuals(insights[1].category ?? insights[1].candidate.category, insights[1].tone ?? insights[1].candidate.tone).iconText
                      }`}
                    >
                      <CategoryIcon
                        category={insights[1].category ?? insights[1].candidate.category}
                        tone={insights[1].tone ?? insights[1].candidate.tone}
                        size={22}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            getCategoryVisuals(insights[1].category ?? insights[1].candidate.category, insights[1].tone ?? insights[1].candidate.tone).pill
                          }`}
                        >
                          <CategoryIcon
                            category={insights[1].category ?? insights[1].candidate.category}
                            tone={insights[1].tone ?? insights[1].candidate.tone}
                            size={10}
                          />
                          <span>
                            {insights[1].categoryLabel ??
                              insights[1].candidate.categoryLabel ??
                              (insights[1].category ? CATEGORY_META[insights[1].category]?.label : "Gợi ý")}
                          </span>
                        </span>
                        {(insights[1].badgeText || insights[1].candidate.badgeText) && (
                          <span className="truncate text-[10px] font-medium text-muted bg-neutral-100/90 px-1.5 py-0.5 rounded">
                            {insights[1].badgeText || insights[1].candidate.badgeText}
                          </span>
                        )}
                      </div>

                      <span className="block truncate text-sm font-semibold text-text">{insights[1].title}</span>

                      {(insights[1].impactLine || insights[1].candidate.impactLine) ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                              getCategoryVisuals(insights[1].category ?? insights[1].candidate.category, insights[1].tone ?? insights[1].candidate.tone).dot
                            }`}
                          />
                          <span className="truncate">{insights[1].impactLine || insights[1].candidate.impactLine}</span>
                        </div>
                      ) : null}

                      <span className="block truncate text-xs text-muted">
                        {insights[1].candidate.metric.label}:{" "}
                        <span className="font-semibold text-text">
                          {formatCandidateMetric(insights[1].candidate.metric)}
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles size={22} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">Chưa có gợi ý mới</span>
                      <span className="block text-xs text-muted">M-Your đang tiếp tục theo dõi tài chính của bạn</span>
                    </div>
                  </>
                )}

                <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
              </button>
            </div>

            {/* Slide 3 (3/3): Insight 3 */}
            <div className="w-full min-w-full shrink-0">
              <button
                type="button"
                onClick={() => handleCardClick(() => insights[2] && setSheetMode("insight_2"))}
                className="flex min-h-[76px] w-full min-w-0 items-center gap-3 px-4 py-2 text-left focus-visible:outline-primary"
                aria-label={insights[2] ? `Xem insight: ${insights[2].title}` : "Chưa có gợi ý mới"}
              >
                {insights[2] ? (
                  <>
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        getCategoryVisuals(insights[2].category ?? insights[2].candidate.category, insights[2].tone ?? insights[2].candidate.tone).iconBg
                      } ${
                        getCategoryVisuals(insights[2].category ?? insights[2].candidate.category, insights[2].tone ?? insights[2].candidate.tone).iconText
                      }`}
                    >
                      <CategoryIcon
                        category={insights[2].category ?? insights[2].candidate.category}
                        tone={insights[2].tone ?? insights[2].candidate.tone}
                        size={22}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            getCategoryVisuals(insights[2].category ?? insights[2].candidate.category, insights[2].tone ?? insights[2].candidate.tone).pill
                          }`}
                        >
                          <CategoryIcon
                            category={insights[2].category ?? insights[2].candidate.category}
                            tone={insights[2].tone ?? insights[2].candidate.tone}
                            size={10}
                          />
                          <span>
                            {insights[2].categoryLabel ??
                              insights[2].candidate.categoryLabel ??
                              (insights[2].category ? CATEGORY_META[insights[2].category]?.label : "Gợi ý")}
                          </span>
                        </span>
                        {(insights[2].badgeText || insights[2].candidate.badgeText) && (
                          <span className="truncate text-[10px] font-medium text-muted bg-neutral-100/90 px-1.5 py-0.5 rounded">
                            {insights[2].badgeText || insights[2].candidate.badgeText}
                          </span>
                        )}
                      </div>

                      <span className="block truncate text-sm font-semibold text-text">{insights[2].title}</span>

                      {(insights[2].impactLine || insights[2].candidate.impactLine) ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                              getCategoryVisuals(insights[2].category ?? insights[2].candidate.category, insights[2].tone ?? insights[2].candidate.tone).dot
                            }`}
                          />
                          <span className="truncate">{insights[2].impactLine || insights[2].candidate.impactLine}</span>
                        </div>
                      ) : null}

                      <span className="block truncate text-xs text-muted">
                        {insights[2].candidate.metric.label}:{" "}
                        <span className="font-semibold text-text">
                          {formatCandidateMetric(insights[2].candidate.metric)}
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles size={22} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">Chưa có gợi ý mới</span>
                      <span className="block text-xs text-muted">M-Your đang tiếp tục theo dõi tài chính của bạn</span>
                    </div>
                  </>
                )}

                <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-1 text-xs text-white">
          {error}
        </p>
      )}

      {/* Insight Detail Sheet */}
      {selectedInsight && (
        <Sheet
          open={sheetMode !== "none" && sheetMode !== "fallback"}
          title={selectedInsight.title}
          onClose={closeSheet}
          className="home-insight-sheet"
        >
          {/* Category Pill and Badge */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                getCategoryVisuals(selectedInsight.category ?? selectedInsight.candidate.category, selectedInsight.tone ?? selectedInsight.candidate.tone).pill
              }`}
            >
              <CategoryIcon
                category={selectedInsight.category ?? selectedInsight.candidate.category}
                tone={selectedInsight.tone ?? selectedInsight.candidate.tone}
                size={13}
              />
              <span>
                {selectedInsight.categoryLabel ??
                  selectedInsight.candidate.categoryLabel ??
                  (selectedInsight.category ? CATEGORY_META[selectedInsight.category]?.label : "Gợi ý")}
              </span>
            </span>
            {(selectedInsight.badgeText || selectedInsight.candidate.badgeText) && (
              <span className="text-xs font-medium text-muted bg-neutral-100 px-2 py-0.5 rounded">
                {selectedInsight.badgeText || selectedInsight.candidate.badgeText}
              </span>
            )}
          </div>

          {/* Impact Line Callout */}
          {(selectedInsight.impactLine || selectedInsight.candidate.impactLine) && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-orange-50/70 p-3 border border-orange-100/80">
              <span
                className={`mt-1 inline-block h-2 w-2 rounded-full shrink-0 ${
                  getCategoryVisuals(selectedInsight.category ?? selectedInsight.candidate.category, selectedInsight.tone ?? selectedInsight.candidate.tone).dot
                }`}
              />
              <p className="text-xs font-semibold text-slate-800 leading-snug">
                {selectedInsight.impactLine || selectedInsight.candidate.impactLine}
              </p>
            </div>
          )}

          <p className="text-sm text-muted leading-relaxed">{selectedInsight.body}</p>

          <div className="my-5 rounded-2xl border border-orange-100 bg-[#fff1ea] p-4">
            <p className="text-xs text-muted">{selectedInsight.candidate.metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-text">
              {formatCandidateMetric(selectedInsight.candidate.metric)}
            </p>
            {selectedInsight.candidate.confidence === "estimated" ? (
              <p className="mt-1 text-xs text-muted">Đây là ước tính dựa trên dữ liệu hiện có.</p>
            ) : (
              <p className="mt-1 text-xs text-muted">Dữ liệu ghi nhận từ tài khoản thực tế.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {/* Primary Action Button */}
            {(() => {
              const primary = selectedInsight.primaryAction ?? selectedInsight.candidate.primaryAction;
              const actionHref = primary?.href ?? selectedInsight.actionHref ?? selectedInsight.candidate.actionHref;
              const actionType = primary?.type ?? selectedInsight.actionType ?? selectedInsight.candidate.actionType;
              const actionLabel = selectedInsight.actionLabel ?? selectedInsight.candidate.actionLabel ?? primary?.label;

              if (actionType === "open_security_handbook") {
                return (
                  <button
                    onClick={() => {
                      closeSheet();
                      setHandbookOpen(true);
                    }}
                    className="login-submit flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck size={16} />
                    <span>{actionLabel ?? "Xem cẩm nang bảo mật"}</span>
                  </button>
                );
              }

              if (actionHref) {
                return (
                  <button
                    onClick={() => pushWithTransition((href) => router.push(href), actionHref)}
                    className="login-submit"
                  >
                    {actionLabel ?? "Xem chi tiết"}
                  </button>
                );
              }

              if (selectedInsight.candidate.action === "overview") {
                return (
                  <button
                    onClick={() => pushWithTransition((href) => router.push(href), "/pfm")}
                    className="login-submit"
                  >
                    Xem tổng quan
                  </button>
                );
              }

              if (actionLabel) {
                return (
                  <button
                    onClick={() => pushWithTransition((href) => router.push(href), "/pfm")}
                    className="login-submit"
                  >
                    {actionLabel}
                  </button>
                );
              }

              return null;
            })()}

            {/* Chat with Assistant Button */}
            <button onClick={() => chat(selectedInsight)} className="home-insight-secondary">
              {selectedInsight.candidate.topic === "allocation"
                ? "Chia tiền cùng M-Your"
                : selectedInsight.candidate.topic === "investment"
                  ? "Tìm hiểu cùng M-Your"
                  : "Xem cụ thể cùng M-Your"}
            </button>

            {/* Dismiss Button */}
            <button
              type="button"
              onClick={() => handleDismiss(selectedInsight.snapshotId)}
              className="mt-1 py-1.5 text-center text-xs text-muted hover:text-text transition-colors"
            >
              Ẩn gợi ý này trong 24h
            </button>
          </div>
        </Sheet>
      )}

      {/* Handbook Sheet (Security Guide) */}
      {handbookOpen && (
        <HandbookSheet context="hub_first" onClose={() => setHandbookOpen(false)} />
      )}
    </>
  );
}
