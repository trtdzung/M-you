"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { pushWithTransition } from "@/lib/view-transition";
import { Sheet } from "@/components/primitives/Sheet";
import {
  ChevronRight,
  Sparkles,
  CalendarClock,
  TrendingDown,
  AlertTriangle,
  Target,
  TrendingUp,
  Activity,
  Trophy,
  ShieldCheck,
  ShieldAlert,
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
  type SecurityAlertLevel,
  type InsightActionChip,
  CATEGORY_META,
} from "@/insights/proactive/home-contract";
import { saveInsightDraft } from "@/insights/proactive/chat-handoff";
import { HandbookSheet } from "@/components/security/HandbookSheet";
import { useAppToday } from "@/state/app-clock";

function getCategoryVisuals(
  category?: InsightCategory,
  tone?: InsightTone,
  securityLevel?: SecurityAlertLevel
) {
  if (securityLevel === "RED" || category === "SECURITY_RED") {
    return {
      pill: "bg-red-50 text-red-700 border-red-200/80",
      dot: "bg-red-500",
      iconBg: "bg-red-50",
      iconText: "text-red-600",
      cardBorder: "border-red-200/80 bg-red-50/30",
    };
  }
  if (securityLevel === "AMBER" || category === "SECURITY_AMBER") {
    return {
      pill: "bg-amber-50 text-amber-800 border-amber-200/80",
      dot: "bg-amber-500",
      iconBg: "bg-amber-50",
      iconText: "text-amber-700",
      cardBorder: "border-amber-200/80 bg-amber-50/30",
    };
  }
  if (securityLevel === "GREEN" || category === "SECURITY_GREEN") {
    return {
      pill: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
      dot: "bg-emerald-500",
      iconBg: "bg-emerald-50",
      iconText: "text-emerald-700",
      cardBorder: "border-emerald-200/80 bg-emerald-50/20",
    };
  }

  const meta = category ? CATEGORY_META[category] : undefined;
  const effectiveTone = tone ?? meta?.defaultTone ?? "info";

  const toneClasses: Record<InsightTone, {
    pill: string;
    dot: string;
    iconBg: string;
    iconText: string;
    cardBorder: string;
  }> = {
    urgent: {
      pill: "bg-red-50 text-red-700 border-red-200/80",
      dot: "bg-red-500",
      iconBg: "bg-red-50",
      iconText: "text-red-600",
      cardBorder: "",
    },
    warning: {
      pill: "bg-amber-50 text-amber-800 border-amber-200/80",
      dot: "bg-amber-500",
      iconBg: "bg-amber-50",
      iconText: "text-amber-700",
      cardBorder: "",
    },
    positive: {
      pill: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
      dot: "bg-emerald-500",
      iconBg: "bg-emerald-50",
      iconText: "text-emerald-700",
      cardBorder: "",
    },
    info: {
      pill: "bg-blue-50 text-blue-800 border-blue-200/80",
      dot: "bg-blue-500",
      iconBg: "bg-blue-50",
      iconText: "text-blue-700",
      cardBorder: "",
    },
    security: {
      pill: "bg-teal-50 text-teal-800 border-teal-200/80",
      dot: "bg-teal-500",
      iconBg: "bg-teal-50",
      iconText: "text-teal-700",
      cardBorder: "",
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
  securityLevel,
  size = 16,
  className = "",
}: {
  category?: InsightCategory;
  tone?: InsightTone;
  securityLevel?: SecurityAlertLevel;
  size?: number;
  className?: string;
}) {
  if (securityLevel === "RED" || category === "SECURITY_RED") {
    return <ShieldAlert size={size} className={className} aria-hidden />;
  }
  if (securityLevel === "AMBER" || category === "SECURITY_AMBER") {
    return <ShieldAlert size={size} className={className} aria-hidden />;
  }
  if (securityLevel === "GREEN" || category === "SECURITY_GREEN" || tone === "security" || category === "DISCOVERY_GUIDE") {
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
  const [selectedInsightIndex, setSelectedInsightIndex] = useState<number | null>(null);
  const [showFallbackSheet, setShowFallbackSheet] = useState(false);
  const [handbookOpen, setHandbookOpen] = useState(false);
  const closeSheet = useCallback(() => {
    setSelectedInsightIndex(null);
    setShowFallbackSheet(false);
  }, []);

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
  const insights: HomeInsight[] =
    currentResult?.secondaryInsights ??
    currentResult?.insights ??
    (currentResult?.insight ? [currentResult.insight] : []);
  const totalSlides = Math.max(insights.length, 1);

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
      setSelectedInsightIndex(null);
      setShowFallbackSheet(false);
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
    setActiveSlide((curr) => (curr > 0 ? curr - 1 : totalSlides - 1));
  }, [totalSlides]);

  const nextSlide = useCallback(() => {
    setActiveSlide((curr) => (curr < totalSlides - 1 ? curr + 1 : 0));
  }, [totalSlides]);

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
      if ((activeSlide === 0 && diff > 0) || (activeSlide === totalSlides - 1 && diff < 0)) {
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

    if (dragOffset < -40 && activeSlide < totalSlides - 1) {
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
        if (diff < -40 && activeSlide < totalSlides - 1) {
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

  const handleChipClick = (chip: InsightActionChip, insight: HomeInsight) => {
    if (chip.actionType === "call_hotline") {
      window.open("tel:19006083");
      return;
    }
    if (chip.actionType === "open_security_handbook") {
      setSelectedInsightIndex(null);
      setHandbookOpen(true);
      return;
    }
    if (chip.actionType === "navigate_smart_otp") {
      pushWithTransition((href) => router.push(href), "/pfm?tab=security&action=smart_otp");
      return;
    }
    if (chip.actionType === "navigate_lock_card") {
      pushWithTransition((href) => router.push(href), "/pfm?tab=security&action=lock_card");
      return;
    }
    if (chip.actionType === "navigate_biometric_settings") {
      pushWithTransition((href) => router.push(href), "/pfm?tab=security&action=biometrics");
      return;
    }
    if (chip.actionType === "request_msb_investigation" || chip.actionType === "chat_handoff") {
      chat(insight);
      return;
    }
    if (chip.actionType === "dismiss" || chip.actionType === "mark_known_sender") {
      handleDismiss(insight.snapshotId);
      return;
    }
    if (chip.actionType === "open_jar_transfer") {
      pushWithTransition((href) => router.push(href), "/pfm?tab=jars");
      return;
    }
    if (chip.actionType === "open_auto_fund") {
      chat(insight);
      return;
    }
    if (chip.href) {
      pushWithTransition((href) => router.push(href), chip.href);
      return;
    }
    pushWithTransition((href) => router.push(href), "/pfm");
  };

  // Loading or Error Fallback
  if (!currentResult) {
    return (
      <>
        <section aria-label="Gợi ý tài chính" className="home-insight-card flex items-center">
          <button
            type="button"
            onClick={() => setShowFallbackSheet(true)}
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
        <Sheet open={showFallbackSheet} title="Gợi ý tài chính" onClose={closeSheet} className="home-insight-sheet">
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

  const selectedInsight = selectedInsightIndex !== null ? insights[selectedInsightIndex] ?? null : null;

  return (
    <>
      <section
        aria-label="Gợi ý tài chính"
        className="home-insight-card relative flex flex-col justify-between overflow-hidden"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Top bar: Carousel Pagination Dots & Slide Counter */}
        <div className="flex items-center justify-between border-b border-orange-100/70 px-4 py-1.5 text-xs">
          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Danh sách slide gợi ý">
            {Array.from({ length: totalSlides }).map((_, idx) => {
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
              {activeSlide + 1} / {totalSlides}
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
            {insights.length === 0 ? (
              <div className="w-full min-w-full shrink-0">
                <div className="flex min-h-[76px] w-full min-w-0 items-center gap-3 px-4 py-2 text-left">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles size={22} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">Chưa có gợi ý mới</span>
                    <span className="block text-xs text-muted">M-Your đang tiếp tục theo dõi tài chính của bạn</span>
                  </div>
                </div>
              </div>
            ) : (
              insights.map((item, idx) => {
                const visuals = getCategoryVisuals(
                  item.category ?? item.candidate.category,
                  item.tone ?? item.candidate.tone,
                  item.securityLevel
                );
                const chips = item.chips ?? item.candidate.chips ?? [];

                return (
                  <div key={item.candidate.id ?? idx} className="w-full min-w-full shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCardClick(() => setSelectedInsightIndex(idx))}
                      className={`flex min-h-[76px] w-full min-w-0 flex-col justify-center px-4 py-2 text-left focus-visible:outline-primary ${visuals.cardBorder}`}
                      aria-label={`Xem insight: ${item.title}`}
                    >
                      <div className="flex w-full items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${visuals.iconBg} ${visuals.iconText}`}
                        >
                          <CategoryIcon
                            category={item.category ?? item.candidate.category}
                            tone={item.tone ?? item.candidate.tone}
                            securityLevel={item.securityLevel}
                            size={22}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${visuals.pill}`}
                            >
                              <CategoryIcon
                                category={item.category ?? item.candidate.category}
                                tone={item.tone ?? item.candidate.tone}
                                securityLevel={item.securityLevel}
                                size={10}
                              />
                              <span>
                                {item.categoryLabel ??
                                  item.candidate.categoryLabel ??
                                  (item.category ? CATEGORY_META[item.category]?.label : "Gợi ý")}
                              </span>
                            </span>
                            {(item.badgeText || item.candidate.badgeText) && (
                              <span className="truncate text-[10px] font-medium text-muted bg-neutral-100/90 px-1.5 py-0.5 rounded">
                                {item.badgeText || item.candidate.badgeText}
                              </span>
                            )}
                          </div>

                          <span className="block truncate text-sm font-semibold text-text">{item.title}</span>

                          {(item.impactLine || item.candidate.impactLine) ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${visuals.dot}`} />
                              <span className="truncate">{item.impactLine || item.candidate.impactLine}</span>
                            </div>
                          ) : null}

                          {item.candidate.metric?.label ? (
                            <span className="block truncate text-xs text-muted">
                              {item.candidate.metric.label}:{" "}
                              <span className="font-semibold text-text">
                                {formatCandidateMetric(item.candidate.metric)}
                              </span>
                            </span>
                          ) : null}
                        </div>

                        <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
                      </div>

                      {/* Action Chips */}
                      {chips.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                          {chips.map((chip) => (
                            <span
                              key={chip.label}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleChipClick(chip, item);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleChipClick(chip, item);
                                }
                              }}
                              className={`shrink-0 rounded-full text-[10px] font-semibold px-2.5 py-0.5 border cursor-pointer transition-all ${
                                chip.variant === "primary"
                                  ? "bg-primary text-white border-primary hover:opacity-90 shadow-xs"
                                  : chip.variant === "ghost"
                                  ? "text-slate-500 border-slate-200/60 hover:bg-slate-100"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
                              }`}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })
            )}
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
          open={selectedInsightIndex !== null}
          title={selectedInsight.title}
          onClose={closeSheet}
          className="home-insight-sheet"
        >
          {/* Category Pill and Badge */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                getCategoryVisuals(
                  selectedInsight.category ?? selectedInsight.candidate.category,
                  selectedInsight.tone ?? selectedInsight.candidate.tone,
                  selectedInsight.securityLevel
                ).pill
              }`}
            >
              <CategoryIcon
                category={selectedInsight.category ?? selectedInsight.candidate.category}
                tone={selectedInsight.tone ?? selectedInsight.candidate.tone}
                securityLevel={selectedInsight.securityLevel}
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
                  getCategoryVisuals(
                    selectedInsight.category ?? selectedInsight.candidate.category,
                    selectedInsight.tone ?? selectedInsight.candidate.tone,
                    selectedInsight.securityLevel
                  ).dot
                }`}
              />
              <p className="text-xs font-semibold text-slate-800 leading-snug">
                {selectedInsight.impactLine || selectedInsight.candidate.impactLine}
              </p>
            </div>
          )}

          <p className="text-sm text-muted leading-relaxed">{selectedInsight.body}</p>

          {selectedInsight.candidate.metric?.label ? (
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
          ) : null}

          <div className="flex flex-col gap-2">
            {/* Action Chips as Buttons */}
            {(() => {
              const chips = selectedInsight.chips ?? selectedInsight.candidate.chips ?? [];
              if (chips.length > 0) {
                return chips.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleChipClick(chip, selectedInsight)}
                    className={
                      chip.variant === "primary"
                        ? "login-submit flex items-center justify-center gap-1.5"
                        : "home-insight-secondary flex items-center justify-center gap-1.5"
                    }
                  >
                    {chip.actionType === "open_security_handbook" && <ShieldCheck size={16} />}
                    <span>{chip.label}</span>
                  </button>
                ));
              }

              // Fallback to primaryAction
              const primary = selectedInsight.primaryAction ?? selectedInsight.candidate.primaryAction;
              const actionHref = primary?.href ?? selectedInsight.actionHref ?? selectedInsight.candidate.actionHref;
              const actionType = primary?.type ?? selectedInsight.actionType ?? selectedInsight.candidate.actionType;
              const actionLabel = selectedInsight.actionLabel ?? selectedInsight.candidate.actionLabel ?? primary?.label;

              if (actionType === "open_security_handbook") {
                return (
                  <button
                    type="button"
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
                    type="button"
                    onClick={() => pushWithTransition((href) => router.push(href), actionHref)}
                    className="login-submit"
                  >
                    {actionLabel ?? "Xem chi tiết"}
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() => pushWithTransition((href) => router.push(href), "/pfm")}
                  className="login-submit"
                >
                  {actionLabel ?? "Xem tổng quan"}
                </button>
              );
            })()}

            {/* Chat with Assistant Button */}
            <button type="button" onClick={() => chat(selectedInsight)} className="home-insight-secondary">
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
