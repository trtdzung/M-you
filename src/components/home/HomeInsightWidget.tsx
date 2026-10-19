"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { pushWithTransition } from "@/lib/view-transition";
import { Sheet } from "@/components/primitives/Sheet";
import { ChevronRight, HeartPulse, Sparkles, CheckCircle2 } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { usePersona } from "@/providers/context";
import { useAssetLiabilities } from "@/state/assets";
import { useGoals } from "@/state/goals";
import { useJarConfig } from "@/state/jars";
import { useCorrections } from "@/state/corrections";
import { useManualTxns } from "@/state/manual-txns";
import type {
  HomeInsight,
  HomeInsightCarouselResult,
} from "@/insights/proactive/home-contract";
import { saveInsightDraft } from "@/insights/proactive/chat-handoff";
import { HealthScoreSheet } from "./HealthScoreSheet";

const TOTAL_SLIDES = 3;

export function HomeInsightWidget() {
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
  const [sheetMode, setSheetMode] = useState<"none" | "health" | "insight_0" | "insight_1">("none");
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

  const currentResult = data?.key === resultKey && ready ? data.result : null;
  const healthScore = currentResult?.healthScore ?? null;
  const healthAssessment = currentResult?.healthAssessment ?? null;
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
    setSheetMode("none");
    setActiveSlide(0);

    if (!ready) return () => controller.abort();

    const deadline = setTimeout(() => {
      controller.abort();
      setData(null);
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
            setData(null);
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
  }, [ready, payload, resultKey, refresh, persona.cif]);

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

  // Loading or Error Fallback
  if (!currentResult) {
    return (
      <>
        <section aria-label="Gợi ý tài chính" className="home-insight-card flex items-center">
          <button
            type="button"
            onClick={() => setSheetMode("health")}
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
        <Sheet open={sheetMode === "health"} title="Gợi ý tài chính" onClose={closeSheet} className="home-insight-sheet">
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

  const activeInsight =
    activeSlide === 1 ? insights[0] : activeSlide === 2 ? insights[1] : null;

  return (
    <>
      <section
        aria-label="Gợi ý tài chính và Sức khỏe tài chính"
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
            {/* Slide 1: Financial Health Score */}
            <div className="w-full min-w-full shrink-0">
              <button
                type="button"
                onClick={() => handleCardClick(() => setSheetMode("health"))}
                className="flex min-h-[72px] w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-primary"
                aria-label={`Xem chi tiết Sức khỏe tài chính: ${
                  healthScore?.overallScore !== null ? `${healthScore?.overallScore} điểm` : "Chưa đủ dữ liệu"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HeartPulse size={22} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-text">Sức khỏe tài chính</span>
                    {healthScore?.overallScore !== null ? (
                      <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-xs font-bold text-primary shadow-xs">
                        {healthScore?.overallScore} / 100
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                        Chưa đủ dữ liệu
                      </span>
                    )}
                  </div>
                  <span className="block truncate text-xs text-muted">
                    {healthScore?.overallScore !== null
                      ? `Độ phủ dữ liệu ${Math.round((healthScore?.scoreCoverage ?? 0) * 100)}% · Vuốt để xem gợi ý`
                      : `Độ phủ dữ liệu ${Math.round((healthScore?.scoreCoverage ?? 0) * 100)}% · Xem chi tiết`}
                  </span>
                </div>

                <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
              </button>
            </div>

            {/* Slide 2: Top 1 Candidate Insight */}
            <div className="w-full min-w-full shrink-0">
              <button
                type="button"
                onClick={() => handleCardClick(() => insights[0] && setSheetMode("insight_0"))}
                className="flex min-h-[72px] w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-primary"
                aria-label={insights[0] ? `Xem insight: ${insights[0].title}` : "Chưa có gợi ý mới"}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles size={22} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  {insights[0] ? (
                    <>
                      <span className="block truncate text-sm font-semibold text-text">{insights[0].title}</span>
                      <span className="block truncate text-xs text-muted">
                        {insights[0].candidate.metric.label}:{" "}
                        <span className="font-semibold text-text">
                          {formatVnd(insights[0].candidate.metric.value)}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-semibold text-text">Chưa có gợi ý mới</span>
                      <span className="block text-xs text-muted">M-Your đang tiếp tục theo dõi tài chính của bạn</span>
                    </>
                  )}
                </div>

                <ChevronRight size={16} className="shrink-0 text-primary" aria-hidden />
              </button>
            </div>

            {/* Slide 3: Top 2 Candidate Insight */}
            <div className="w-full min-w-full shrink-0">
              <button
                type="button"
                onClick={() => handleCardClick(() => insights[1] && setSheetMode("insight_1"))}
                className="flex min-h-[72px] w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-primary"
                aria-label={insights[1] ? `Xem insight: ${insights[1].title}` : "Chưa có gợi ý mới"}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {insights[1] ? <Sparkles size={22} aria-hidden /> : <CheckCircle2 size={22} aria-hidden />}
                </div>

                <div className="min-w-0 flex-1">
                  {insights[1] ? (
                    <>
                      <span className="block truncate text-sm font-semibold text-text">{insights[1].title}</span>
                      <span className="block truncate text-xs text-muted">
                        {insights[1].candidate.metric.label}:{" "}
                        <span className="font-semibold text-text">
                          {formatVnd(insights[1].candidate.metric.value)}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-semibold text-text">Chưa có gợi ý mới</span>
                      <span className="block text-xs text-muted">M-Your đang tiếp tục theo dõi tài chính của bạn</span>
                    </>
                  )}
                </div>

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

      {/* Health Score Detail Sheet */}
      <HealthScoreSheet
        open={sheetMode === "health"}
        onClose={closeSheet}
        healthScore={healthScore}
        assessment={healthAssessment}
        onOpenOverview={() => pushWithTransition((href) => router.push(href), "/pfm")}
      />

      {/* Insight 1 Detail Sheet */}
      {insights[0] && (
        <Sheet
          open={sheetMode === "insight_0"}
          title={insights[0].title}
          onClose={closeSheet}
          className="home-insight-sheet"
        >
          <p className="text-sm text-muted">{insights[0].body}</p>
          <div className="my-5 rounded-2xl border border-orange-100 bg-[#fff1ea] p-4">
            <p className="text-xs text-muted">{insights[0].candidate.metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-text">
              {formatVnd(insights[0].candidate.metric.value)}
            </p>
            {insights[0].candidate.confidence === "estimated" && (
              <p className="mt-1 text-xs text-muted">Đây là ước tính dựa trên dữ liệu hiện có.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {insights[0].candidate.action === "overview" && (
              <button
                onClick={() => pushWithTransition((href) => router.push(href), "/pfm")}
                className="login-submit"
              >
                Xem tổng quan
              </button>
            )}
            <button onClick={() => chat(insights[0])} className="home-insight-secondary">
              {insights[0].candidate.topic === "allocation"
                ? "Chia tiền cùng M-Your"
                : insights[0].candidate.topic === "investment"
                  ? "Tìm hiểu cùng M-Your"
                  : "Xem cụ thể cùng M-Your"}
            </button>
          </div>
        </Sheet>
      )}

      {/* Insight 2 Detail Sheet */}
      {insights[1] && (
        <Sheet
          open={sheetMode === "insight_1"}
          title={insights[1].title}
          onClose={closeSheet}
          className="home-insight-sheet"
        >
          <p className="text-sm text-muted">{insights[1].body}</p>
          <div className="my-5 rounded-2xl border border-orange-100 bg-[#fff1ea] p-4">
            <p className="text-xs text-muted">{insights[1].candidate.metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-text">
              {formatVnd(insights[1].candidate.metric.value)}
            </p>
            {insights[1].candidate.confidence === "estimated" && (
              <p className="mt-1 text-xs text-muted">Đây là ước tính dựa trên dữ liệu hiện có.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {insights[1].candidate.action === "overview" && (
              <button
                onClick={() => pushWithTransition((href) => router.push(href), "/pfm")}
                className="login-submit"
              >
                Xem tổng quan
              </button>
            )}
            <button onClick={() => chat(insights[1])} className="home-insight-secondary">
              {insights[1].candidate.topic === "allocation"
                ? "Chia tiền cùng M-Your"
                : insights[1].candidate.topic === "investment"
                  ? "Tìm hiểu cùng M-Your"
                  : "Xem cụ thể cùng M-Your"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
