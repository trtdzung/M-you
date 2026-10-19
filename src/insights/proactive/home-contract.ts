import type { SnapshotCandidate } from "./snapshot";
import type { FinancialHealthScoreResult, HealthPillar } from "@/domain/models/health-score";

export type InsightDomain = "PFM" | "SECURITY" | "pfm" | "security";
export type SecurityAlertLevel = "RED" | "AMBER" | "GREEN";

export type InsightCategory =
  | "UPCOMING_OBLIGATION" // 1. Nghĩa vụ sắp đến hạn
  | "CASHFLOW_RISK"       // 2. Rủi ro dòng tiền
  | "ANOMALY_LEAKAGE"     // 3. Bất thường & rò rỉ
  | "GOAL_PROGRESS"       // 4. Tiến độ mục tiêu
  | "OPTIMIZATION"        // 5. Cơ hội tối ưu
  | "PERIODIC_PULSE"      // 6. Nhịp tiền định kỳ
  | "RECOGNITION_RECAP"   // 7. Ghi nhận & nhìn lại
  | "DISCOVERY_GUIDE"     // 8. Khám phá & hướng dẫn (PFM + Security Hub)
  | "SECURITY_RED"        // Cảnh báo bảo mật mức Đỏ (SC3, Hold, BT5/T7b)
  | "SECURITY_AMBER"      // Cảnh báo bảo mật mức Vàng (BT4/T7a)
  | "SECURITY_GREEN";     // Bảo mật mức Xanh (BT3, BT1, All-Clear)

export type InsightSlotGroup = "PROTECT" | "GROW_AND_GUIDE";

export type InsightTone = "urgent" | "warning" | "positive" | "info" | "security" | "critical";

export type InsightChipActionType =
  | "navigate_pfm"
  | "navigate_transfer"
  | "navigate_goals"
  | "navigate_wrapped"
  | "navigate_security_hub"
  | "open_jar_transfer"
  | "open_auto_fund"
  | "open_security_handbook"
  | "open_emergency_contact"
  | "request_msb_investigation"
  | "mark_known_sender"
  | "view_fraud_case"
  | "chat_handoff"
  | "call_hotline"
  | "navigate_smart_otp"
  | "navigate_lock_card"
  | "navigate_biometric_settings"
  | "dismiss";

export type InsightPrimaryActionType = InsightChipActionType;

export interface InsightActionChip {
  id?: string;
  label: string;
  actionType: InsightPrimaryActionType;
  href?: string;
  prompt?: string;
  variant?: "primary" | "secondary" | "ghost";
}

export interface InsightActionSpec {
  type: InsightPrimaryActionType;
  label: string;
  href?: string;
  payload?: Record<string, string | number>;
}

export interface CategoryMeta {
  category: InsightCategory;
  label: string;
  slotGroup: InsightSlotGroup;
  defaultTone: InsightTone;
  iconName: "CalendarClock" | "TrendingDown" | "AlertTriangle" | "Target" | "TrendingUp" | "Activity" | "Trophy" | "ShieldCheck" | "Sparkles";
}

export const CATEGORY_META: Record<InsightCategory, CategoryMeta> = {
  UPCOMING_OBLIGATION: {
    category: "UPCOMING_OBLIGATION",
    label: "Nghĩa vụ sắp đến hạn",
    slotGroup: "PROTECT",
    defaultTone: "urgent",
    iconName: "CalendarClock",
  },
  CASHFLOW_RISK: {
    category: "CASHFLOW_RISK",
    label: "Rủi ro dòng tiền",
    slotGroup: "PROTECT",
    defaultTone: "warning",
    iconName: "TrendingDown",
  },
  ANOMALY_LEAKAGE: {
    category: "ANOMALY_LEAKAGE",
    label: "Bất thường & rò rỉ",
    slotGroup: "PROTECT",
    defaultTone: "warning",
    iconName: "AlertTriangle",
  },
  GOAL_PROGRESS: {
    category: "GOAL_PROGRESS",
    label: "Tiến độ mục tiêu",
    slotGroup: "GROW_AND_GUIDE",
    defaultTone: "positive",
    iconName: "Target",
  },
  OPTIMIZATION: {
    category: "OPTIMIZATION",
    label: "Cơ hội tối ưu",
    slotGroup: "GROW_AND_GUIDE",
    defaultTone: "info",
    iconName: "TrendingUp",
  },
  PERIODIC_PULSE: {
    category: "PERIODIC_PULSE",
    label: "Nhịp tiền định kỳ",
    slotGroup: "GROW_AND_GUIDE",
    defaultTone: "info",
    iconName: "Activity",
  },
  RECOGNITION_RECAP: {
    category: "RECOGNITION_RECAP",
    label: "Ghi nhận & nhìn lại",
    slotGroup: "GROW_AND_GUIDE",
    defaultTone: "positive",
    iconName: "Trophy",
  },
  DISCOVERY_GUIDE: {
    category: "DISCOVERY_GUIDE",
    label: "Khám phá & Bảo mật",
    slotGroup: "GROW_AND_GUIDE",
    defaultTone: "security",
    iconName: "ShieldCheck",
  },
  SECURITY_RED: {
    category: "SECURITY_RED",
    label: "Bảo mật · Đỏ",
    slotGroup: "PROTECT",
    defaultTone: "urgent",
    iconName: "ShieldCheck",
  },
  SECURITY_AMBER: {
    category: "SECURITY_AMBER",
    label: "Cảnh báo Vàng",
    slotGroup: "PROTECT",
    defaultTone: "warning",
    iconName: "ShieldCheck",
  },
  SECURITY_GREEN: {
    category: "SECURITY_GREEN",
    label: "Bảo mật · Xanh",
    slotGroup: "GROW_AND_GUIDE",
    defaultTone: "security",
    iconName: "ShieldCheck",
  },
};

export function resolveInsightCategory(candidate: SnapshotCandidate): {
  category: InsightCategory;
  categoryLabel: string;
  slotGroup: InsightSlotGroup;
  tone: InsightTone;
  primaryAction: InsightActionSpec;
} {
  if (candidate.category) {
    const meta = CATEGORY_META[candidate.category];
    return {
      category: candidate.category,
      categoryLabel: candidate.categoryLabel ?? meta.label,
      slotGroup: candidate.slotGroup ?? meta.slotGroup,
      tone: candidate.tone ?? meta.defaultTone,
      primaryAction: candidate.primaryAction ?? {
        type: candidate.actionType ?? (candidate.action === "overview" ? "navigate_pfm" : "chat_handoff"),
        label: candidate.action === "overview" ? "Xem chi tiết" : "Trao đổi cùng M-Your",
        href: candidate.actionHref,
      },
    };
  }

  // Fallback for legacy candidates without category
  if (candidate.topic === "payment") {
    return {
      category: "UPCOMING_OBLIGATION",
      categoryLabel: CATEGORY_META.UPCOMING_OBLIGATION.label,
      slotGroup: "PROTECT",
      tone: candidate.severity === "urgent" ? "urgent" : "warning",
      primaryAction: { type: "navigate_transfer", label: "Thanh toán ngay", href: "/transfer" },
    };
  }
  if (candidate.topic === "spending") {
    if (candidate.id.startsWith("spending:jar:")) {
      return {
        category: "CASHFLOW_RISK",
        categoryLabel: CATEGORY_META.CASHFLOW_RISK.label,
        slotGroup: "PROTECT",
        tone: candidate.severity === "urgent" ? "urgent" : "warning",
        primaryAction: { type: "open_jar_transfer", label: "Bù tiền giữa các hũ" },
      };
    }
    return {
      category: "ANOMALY_LEAKAGE",
      categoryLabel: CATEGORY_META.ANOMALY_LEAKAGE.label,
      slotGroup: "PROTECT",
      tone: candidate.id.startsWith("refund:") ? "info" : "warning",
      primaryAction: { type: "navigate_pfm", label: "Xem chi tiết", href: "/pfm" },
    };
  }
  if (candidate.topic === "investment" || candidate.topic === "allocation") {
    return {
      category: "OPTIMIZATION",
      categoryLabel: CATEGORY_META.OPTIMIZATION.label,
      slotGroup: "GROW_AND_GUIDE",
      tone: "info",
      primaryAction: {
        type: candidate.topic === "allocation" ? "open_auto_fund" : "chat_handoff",
        label: candidate.topic === "allocation" ? "Chia tiền vào hũ" : "Tối ưu cùng M-Your",
      },
    };
  }
  return {
    category: "DISCOVERY_GUIDE",
    categoryLabel: CATEGORY_META.DISCOVERY_GUIDE.label,
    slotGroup: "GROW_AND_GUIDE",
    tone: "info",
    primaryAction: { type: "navigate_pfm", label: "Khám phá", href: "/pfm" },
  };
}

export interface HomeInsight {
  snapshotId: string;
  candidate: SnapshotCandidate;
  title: string;
  body: string;
  source: "agent" | "fallback" | "proactive_agent";
  asOf: string;
  domain?: InsightDomain;
  securityLevel?: SecurityAlertLevel;
  scenarioCode?: "BT1" | "BT3" | "BT4" | "BT5" | "SC3" | "ALL_CLEAR";
  category?: InsightCategory;
  categoryLabel?: string;
  slotGroup?: InsightSlotGroup;
  tone?: InsightTone;
  impactLine?: string;
  badgeText?: string;
  progressPct?: number;
  primaryAction?: InsightActionSpec;
  actionType?: InsightPrimaryActionType;
  actionHref?: string;
  actionLabel?: string;
  chips?: InsightActionChip[];
}

export interface PillarAssessment {
  pillar: HealthPillar;
  status: "strength" | "watch" | "insufficient_data";
  explanation: string;
}

export interface HealthScoreAssessment {
  snapshotId: string;
  source: "agent";
  summary: string;
  pillarAssessments: PillarAssessment[];
  strengths: string[];
  areasToWatch: string[];
  recommendedActions: string[];
  dataLimitations: string[];
}

export interface HomeInsightCarouselResult {
  snapshotId: string;
  asOf: string;
  healthScore: FinancialHealthScoreResult;
  healthAssessment: HealthScoreAssessment | null;
  insights: HomeInsight[]; // up to 5 candidates: [urgentSecurity] -> [selectedPfm] -> [greenSecurity]
  secondaryInsights?: HomeInsight[]; // alias for insights
  insight: HomeInsight | null; // legacy alias for insights[0] ?? null
  cached: boolean;
  reason?: "no_candidate" | "dismissed";
}

/** Legacy alias so existing callers and tests remain fully compatible */
export type HomeInsightResult = HomeInsightCarouselResult;

export function validAgentSelection(value: unknown, snapshotId: string, candidates: SnapshotCandidate[]) {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const sid = r.snapshotId ?? r.snapshot_id;
  if (sid !== snapshotId) return null;

  // Support array of selected insights (1 to 5)
  if (Array.isArray(r.selected)) {
    if (r.selected.length < 1 || r.selected.length > 5) return null;
    const items: Array<{
      candidate: SnapshotCandidate;
      title: string;
      body: string;
      category?: InsightCategory;
      categoryLabel?: string;
      slotGroup?: InsightSlotGroup;
      tone?: InsightTone;
      impactLine?: string;
      badgeText?: string;
      chips?: InsightActionChip[];
      primaryAction?: InsightActionSpec;
      actionType?: InsightPrimaryActionType;
      actionHref?: string;
      actionLabel?: string;
    }> = [];

    for (const item of r.selected) {
      if (!item || typeof item !== "object") return null;
      const it = item as Record<string, unknown>;
      const cand = candidates.find((c) => c.id === it.candidate_id);
      if (!cand || typeof it.title !== "string" || typeof it.body !== "string" ||
        !it.title.trim() || !it.body.trim() || it.title.length > 70 || it.body.length > 240 ||
        /\p{N}|https?:|```/iu.test(it.title + it.body)) return null;

      items.push({
        candidate: cand,
        title: it.title,
        body: it.body,
        category: cand.category,
        categoryLabel: cand.categoryLabel,
        slotGroup: cand.slotGroup,
        tone: cand.tone,
        impactLine: cand.impactLine,
        badgeText: cand.badgeText,
        chips: cand.chips,
        primaryAction: cand.primaryAction,
        actionType: cand.actionType,
        actionHref: cand.actionHref,
        actionLabel: cand.actionLabel,
      });
    }

    return {
      selected: items,
      candidate: items[0].candidate,
      title: items[0].title,
      body: items[0].body,
      category: items[0].candidate.category,
      categoryLabel: items[0].candidate.categoryLabel,
      slotGroup: items[0].candidate.slotGroup,
      tone: items[0].candidate.tone,
      impactLine: items[0].candidate.impactLine,
      badgeText: items[0].candidate.badgeText,
      chips: items[0].candidate.chips,
      primaryAction: items[0].candidate.primaryAction,
      actionType: items[0].candidate.actionType,
      actionHref: items[0].candidate.actionHref,
      actionLabel: items[0].candidate.actionLabel,
    };
  }

  // Single selection fallback
  const topPriority = Math.min(...candidates.map((c) => c.priority));
  const candidate = candidates.find((c) => c.id === r.candidate_id && c.priority === topPriority);
  if (!candidate || typeof r.title !== "string" || typeof r.body !== "string" ||
    !r.title.trim() || !r.body.trim() || r.title.length > 70 || r.body.length > 240 ||
    /\p{N}|https?:|```/iu.test(r.title + r.body)) return null;

  return {
    candidate,
    title: r.title,
    body: r.body,
    category: candidate.category,
    categoryLabel: candidate.categoryLabel,
    slotGroup: candidate.slotGroup,
    tone: candidate.tone,
    impactLine: candidate.impactLine,
    badgeText: candidate.badgeText,
    progressPct: candidate.progressPct,
    chips: candidate.chips,
    primaryAction: candidate.primaryAction,
    actionType: candidate.actionType,
    actionHref: candidate.actionHref,
    actionLabel: candidate.actionLabel,
  };
}

export function fallbackPayload(
  snapshot: {
    asOf: string;
    healthScore: FinancialHealthScoreResult;
    candidates: SnapshotCandidate[];
    snapshotId?: string;
  },
  snapshotIdFallback: string = ""
): HomeInsightCarouselResult {
  const sid = snapshot.snapshotId ?? snapshotIdFallback;
  const candidates = snapshot.candidates.slice(0, 5);
  const insights: HomeInsight[] = candidates.map((cand) => ({
    snapshotId: sid,
    candidate: cand,
    title: cand.title,
    body: cand.body,
    asOf: snapshot.asOf,
    source: "fallback",
    domain: cand.domain,
    securityLevel: cand.securityLevel,
    scenarioCode: cand.scenarioCode,
    category: cand.category,
    categoryLabel: cand.categoryLabel,
    slotGroup: cand.slotGroup,
    tone: cand.tone,
    impactLine: cand.impactLine,
    badgeText: cand.badgeText,
    progressPct: cand.progressPct,
    chips: cand.chips,
    primaryAction: cand.primaryAction,
    actionType: cand.actionType,
    actionHref: cand.actionHref,
    actionLabel: cand.actionLabel ?? cand.primaryAction?.label,
  }));

  return {
    snapshotId: sid,
    asOf: snapshot.asOf,
    healthScore: snapshot.healthScore,
    healthAssessment: null,
    insights,
    secondaryInsights: insights,
    insight: insights[0] ?? null,
    cached: false,
  };
}

const VALID_PILLARS = new Set<HealthPillar>(["SPEND", "SAVE", "BORROW", "PLAN_PROTECT"]);
const VALID_STATUSES = new Set<string>(["strength", "watch", "insufficient_data"]);

export function validHealthScoreAssessment(value: unknown, snapshotId: string): HealthScoreAssessment | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const sid = r.snapshotId ?? r.snapshot_id;
  if (sid !== snapshotId) return null;
  if (r.source !== "agent") return null;
  if (typeof r.summary !== "string" || !r.summary.trim() || r.summary.length > 600) return null;

  const rawPillars = Array.isArray(r.pillarAssessments ?? r.pillar_assessments)
    ? (r.pillarAssessments ?? r.pillar_assessments) as unknown[]
    : [];

  const pillarAssessments: PillarAssessment[] = [];
  for (const item of rawPillars) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const pillar = p.pillar as HealthPillar;
    const status = p.status as "strength" | "watch" | "insufficient_data";
    const explanation = typeof p.explanation === "string" ? p.explanation.trim() : "";
    if (VALID_PILLARS.has(pillar) && VALID_STATUSES.has(status) && explanation.length > 0 && explanation.length <= 400) {
      pillarAssessments.push({ pillar, status, explanation });
    }
  }

  const toStringArray = (val: unknown): string[] => {
    if (!Array.isArray(val)) return [];
    return val
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 300)
      .slice(0, 10);
  };

  const strengths = toStringArray(r.strengths);
  const areasToWatch = toStringArray(r.areasToWatch ?? r.areas_to_watch);
  const recommendedActions = toStringArray(r.recommendedActions ?? r.recommended_actions);
  const dataLimitations = toStringArray(r.dataLimitations ?? r.data_limitations);

  return {
    snapshotId,
    source: "agent",
    summary: r.summary.trim(),
    pillarAssessments,
    strengths,
    areasToWatch,
    recommendedActions,
    dataLimitations,
  };
}
