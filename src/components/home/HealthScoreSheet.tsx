"use client";

import { Sheet } from "@/components/primitives/Sheet";
import type { FinancialHealthScoreResult, HealthMetricId } from "@/domain/models/health-score";
import type { HealthScoreAssessment } from "@/insights/proactive/home-contract";
import { AlertCircle, ChevronRight, Info, Sparkles } from "lucide-react";

interface HealthScoreSheetProps {
  open: boolean;
  onClose: () => void;
  healthScore: FinancialHealthScoreResult | null;
  assessment: HealthScoreAssessment | null;
  onOpenOverview: () => void;
}

const TIER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  healthy: { label: "Lành mạnh", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  good: { label: "Khá tốt", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  coping: { label: "Trung bình", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  vulnerable: { label: "Cần lưu ý", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const PILLAR_NAMES = {
  SPEND: "Chi tiêu (Spend)",
  SAVE: "Tiết kiệm (Save)",
  BORROW: "Nghĩa vụ nợ (Borrow)",
  PLAN_PROTECT: "Dự phòng & Kế hoạch (Plan & Protect)",
};

const METRIC_LABELS: Record<HealthMetricId, string> = {
  SPENDING_TO_INCOME: "Tỷ lệ chi tiêu trên thu nhập",
  PAYMENT_TIMELINESS: "Kịp thời hạn thanh toán hóa đơn",
  CASH_RUNWAY: "Dự phòng tiền mặt khẩn cấp",
  SAVINGS_RATE: "Tỷ lệ tích lũy & tiết kiệm",
  DEBT_SERVICE_RATIO: "Gánh nặng trả nợ (DSR)",
  CREDIT_BEHAVIOR: "Hành vi tín dụng & thấu chi",
  GOAL_PROGRESS: "Tiến độ thực hiện mục tiêu",
  INSURANCE_COVERAGE: "Độ phủ bảo hiểm bảo vệ",
};

export function HealthScoreSheet({
  open,
  onClose,
  healthScore,
  assessment,
  onOpenOverview,
}: HealthScoreSheetProps) {
  if (!healthScore) {
    return (
      <Sheet open={open} title="Sức khỏe tài chính" onClose={onClose} className="home-insight-sheet">
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p>Hiện chưa có dữ liệu điểm sức khỏe tài chính cho tài khoản này.</p>
        </div>
      </Sheet>
    );
  }

  const tierInfo = healthScore.tier ? TIER_LABELS[healthScore.tier] : null;
  const coveragePct = Math.round(healthScore.scoreCoverage * 100);

  return (
    <Sheet open={open} title="Sức khỏe tài chính" onClose={onClose} className="home-insight-sheet">
      <div className="space-y-6">
        {/* Policy & date metadata */}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Quy tắc: <code className="font-mono text-text">{healthScore.policyVersion}</code></span>
          <span>Cập nhật: {healthScore.computedAt ? new Date(healthScore.computedAt).toLocaleDateString("vi-VN") : "N/A"}</span>
        </div>

        {/* Overall Score Card */}
        <div className="rounded-2xl border border-orange-100 bg-[#fff5f0] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Điểm tổng thể</p>
              <div className="mt-1 flex items-baseline gap-2">
                {healthScore.overallScore !== null ? (
                  <>
                    <span className="text-4xl font-extrabold text-text">{healthScore.overallScore}</span>
                    <span className="text-sm font-semibold text-muted">/ 100</span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-amber-700">Chưa đủ dữ liệu</span>
                )}
              </div>
            </div>
            {tierInfo && (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tierInfo.bg} ${tierInfo.color}`}>
                {tierInfo.label}
              </span>
            )}
          </div>

          {healthScore.overallScore === null && (
            <p className="mt-3 text-xs leading-relaxed text-amber-800">
              Cần tối thiểu 3/4 trụ cột và 5/8 chỉ số để tính điểm sức khỏe tổng thể.
            </p>
          )}

          {/* Coverage note */}
          <div className="mt-4 flex items-start gap-2 border-t border-orange-200/60 pt-3 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-text">Độ phủ dữ liệu: {coveragePct}%</span> — Đây là tỷ lệ các chỉ số có đủ dữ liệu để tính toán, không phải độ tin cậy của điểm số.
            </p>
          </div>
        </div>

        {/* 4 Pillars Breakdown */}
        <div>
          <h3 className="text-sm font-semibold text-text">Điểm 4 trụ cột tài chính</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {(["SPEND", "SAVE", "BORROW", "PLAN_PROTECT"] as const).map((pillar) => {
              const val = healthScore.pillarScores[pillar];
              return (
                <div key={pillar} className="rounded-xl border border-gray-100 bg-white p-3 shadow-xs">
                  <p className="truncate text-[11px] font-medium text-muted">{PILLAR_NAMES[pillar].split(" ")[0]}</p>
                  <p className="mt-1 text-lg font-bold text-text">
                    {val !== null ? `${val} đ` : <span className="text-xs font-normal text-muted">—</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Agent Qualitative Assessment Section */}
        <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/50 to-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-purple-950">Nhận xét của M-Your</h3>
          </div>

          {assessment ? (
            <div className="mt-3 space-y-3 text-xs leading-relaxed text-gray-700">
              <p className="font-medium text-text">{assessment.summary}</p>

              {assessment.strengths.length > 0 && (
                <div>
                  <p className="font-semibold text-emerald-800">Điểm sáng:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-emerald-900">
                    {assessment.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {assessment.areasToWatch.length > 0 && (
                <div>
                  <p className="font-semibold text-amber-800">Điểm cần chú ý:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900">
                    {assessment.areasToWatch.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {assessment.recommendedActions.length > 0 && (
                <div>
                  <p className="font-semibold text-purple-800">Đề xuất hành động:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-purple-900">
                    {assessment.recommendedActions.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {assessment.dataLimitations.length > 0 && (
                <div className="border-t border-purple-100 pt-2 text-[11px] text-muted">
                  <p className="font-medium">Giới hạn dữ liệu:</p>
                  <ul className="mt-0.5 list-inside list-disc space-y-0.5">
                    {assessment.dataLimitations.map((l, idx) => (
                      <li key={idx}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-purple-200 bg-white/80 p-3 text-xs text-muted">
              <p className="flex items-center gap-1.5 font-medium text-gray-600">
                <Info className="h-3.5 w-3.5 text-purple-500" />
                Đánh giá từ trợ lý tài chính hiện chưa sẵn sàng.
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Bạn vẫn có thể xem chi tiết điểm số và các chỉ số đo lường thực tế từ hệ thống bên dưới.
              </p>
            </div>
          )}
        </div>

        {/* 8 Detailed Metrics Breakdown */}
        <div>
          <h3 className="text-sm font-semibold text-text">Chi tiết 8 chỉ số thành phần</h3>
          <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white text-xs">
            {healthScore.metrics.map((m) => {
              const hasScore = m.score !== null;
              const label = METRIC_LABELS[m.id] || m.id;
              return (
                <div key={m.id} className="flex flex-col gap-1 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text">{label}</span>
                    <span className={`font-semibold ${hasScore ? "text-text" : "text-muted"}`}>
                      {hasScore ? `${m.score} đ` : "Chưa có"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>
                      Giá trị:{" "}
                      <span className="font-mono text-gray-700">
                        {m.rawValue !== null
                          ? typeof m.rawValue === "boolean"
                            ? m.rawValue
                              ? "Có"
                              : "Không"
                            : typeof m.rawValue === "number" && m.rawUnit === "ratio"
                              ? `${Math.round(m.rawValue * 100)}%`
                              : `${m.rawValue} ${m.rawUnit}`
                          : "—"}
                      </span>
                    </span>
                    <span>Nguồn: {m.source}</span>
                  </div>

                  {m.reasonUnavailable && (
                    <p className="mt-0.5 text-[11px] text-amber-700">{m.reasonUnavailable}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <button
          type="button"
          onClick={onOpenOverview}
          className="home-insight-secondary"
        >
          Xem tổng quan tài chính
        </button>
      </div>
    </Sheet>
  );
}
