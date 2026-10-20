import type { Asset, Goal, JarConfig, Liability, StoredCategory, Transaction } from "@/domain/models";
import { computeFinancials, type RawData } from "@/domain/engine/finance-compose";
import { composeFinancialHealthScore } from "@/domain/engine/health-score-compose";
import { aggregateCashflow, netExpenseByCategory } from "@/domain/engine/cashflow";
import { addMonthsToKey, dateToMonthKey, monthPeriodFromKey, VN_UTC_OFFSET_MS, type Period } from "@/domain/engine/types";
import type {
  InsightCategory,
  InsightSlotGroup,
  InsightTone,
  InsightPrimaryActionType,
  InsightActionSpec,
  InsightDomain,
  SecurityAlertLevel,
  InsightActionChip,
} from "./home-contract";

export type InsightTopic = "payment" | "spending" | "allocation" | "investment";

export type MetricUnit = "VND" | "points" | "count" | "percent";

export interface SnapshotCandidate {
  id: string;
  topic: InsightTopic;
  priority: number;
  severity: "urgent" | "attention" | "info" | "warning";
  confidence: "recorded" | "estimated";
  title: string;
  body: string;
  metric: { label: string; value: number; unit: MetricUnit | string };
  /**
   * `items` (the "payment"/"bill" candidates below) is a flat-record array — the
   * shape the agent reads verbatim, never a free-form object — everything else
   * here is a single scalar.
   */
  facts: Record<string, string | number | boolean | null | Array<Record<string, string | number | boolean | null>>>;
  action: "overview" | "chat";
  question: string;
  // Reframed fields
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

export interface SecuritySummaryInput {
  score?: number;
  hasEmergencyContact?: boolean;
  hasActiveHold?: boolean;
  hasMaturingFd?: boolean;
  hasPendingOff?: boolean;
  hasActiveCase?: boolean; // SC3: có hồ sơ tra soát đang mở trong src/lib/security/case-store.ts
  largeUnknownInflow?: { amount: number; senderName?: string }; // BT5 (T7b): nhận >= 10 triệu từ TK lạ
  baitInflow?: { count: number; lastAmount: number; senderName?: string }; // BT4 (T7a): nhận >= 3 khoản nhỏ liên tiếp từ 1 TK lạ
  highBalanceInflow?: { amount: number }; // BT3: nhận khoản >= 50 triệu
  isNewUserOnboarding?: boolean; // BT1
}

export function formatVndVietnamese(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    const val = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${sign}${val} tỷ`;
  }
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",");
    return `${sign}${val} triệu`;
  }
  if (abs >= 1_000) {
    const val = (abs / 1_000).toFixed(0);
    return `${sign}${val} nghìn`;
  }
  return `${sign}${abs.toLocaleString("vi-VN")} đ`;
}

export const FALLBACK_CANDIDATES: SnapshotCandidate[] = [
  {
    id: "pulse:weekly_brief_fallback",
    topic: "spending",
    category: "PERIODIC_PULSE",
    categoryLabel: "Nhịp tiền định kỳ",
    slotGroup: "GROW_AND_GUIDE",
    tone: "info",
    priority: 5,
    severity: "info",
    confidence: "recorded",
    title: "Nhịp chi tiêu tuần",
    body: "Theo dõi nhịp chi tiêu định kỳ và các khoản hóa đơn sắp đến trong tuần.",
    impactLine: "Duy trì nhịp chi đều đặn để chủ động dòng tiền cả tháng.",
    badgeText: "Nhịp tuần",
    actionType: "navigate_pfm",
    actionHref: "/pfm",
    actionLabel: "Xem nhịp chi tiêu",
    primaryAction: { type: "navigate_pfm", label: "Xem nhịp chi tiêu", href: "/pfm" },
    metric: { label: "Theo dõi nhịp tuần", value: 1, unit: "count" },
    facts: { source: "fallback_pulse" },
    action: "overview",
    question: "Tóm tắt nhịp chi tiêu tuần của tôi.",
  },
  {
    id: "recap:wrapped_recap_fallback",
    topic: "spending",
    category: "RECOGNITION_RECAP",
    categoryLabel: "Ghi nhận & nhìn lại",
    slotGroup: "GROW_AND_GUIDE",
    tone: "positive",
    priority: 5,
    severity: "info",
    confidence: "recorded",
    title: "Hành trình nhìn lại (Wrapped)",
    body: "Khám phá phong cách chi tiêu và tổng kết kỷ luật ngân sách của bạn.",
    impactLine: "Xem ngay phân tích thói quen và sức khỏe tài chính tại Wrapped.",
    badgeText: "Wrapped",
    actionType: "navigate_wrapped",
    actionHref: "/wrapped",
    actionLabel: "Xem nhìn lại & Sức khỏe tài chính",
    primaryAction: { type: "navigate_wrapped", label: "Xem nhìn lại & Sức khỏe tài chính", href: "/wrapped" },
    metric: { label: "Hành trình nhìn lại", value: 100, unit: "percent" },
    facts: { source: "fallback_wrapped" },
    action: "overview",
    question: "Cho tôi xem tổng kết tháng tại Wrapped.",
  },
  {
    id: "security:handbook_fallback",
    topic: "spending",
    category: "DISCOVERY_GUIDE",
    categoryLabel: "Khám phá & Bảo mật",
    slotGroup: "GROW_AND_GUIDE",
    tone: "security",
    priority: 5,
    severity: "info",
    confidence: "recorded",
    title: "Cẩm nang an toàn tài khoản",
    body: "Tìm hiểu các giải pháp phòng tránh lừa đảo và kích hoạt Khiên bảo vệ tài khoản MSB.",
    impactLine: "Xem cẩm nang bảo mật để chủ động bảo vệ tài khoản và giao dịch.",
    badgeText: "Bảo mật",
    actionType: "open_security_handbook",
    actionHref: "/settings",
    actionLabel: "Xem cẩm nang bảo mật",
    primaryAction: { type: "open_security_handbook", label: "Xem cẩm nang bảo mật", href: "/settings" },
    metric: { label: "Điểm an toàn chuẩn", value: 100, unit: "points" },
    facts: { source: "fallback_security" },
    action: "overview",
    question: "Cẩm nang bảo vệ tài khoản MSB.",
  },
];

/**
 * 3-Slide Diversity Algorithm:
 * - Slide 1: Ưu tiên nhóm Bảo vệ/Khẩn cấp (UPCOMING_OBLIGATION, CASHFLOW_RISK).
 * - Slide 2: Ưu tiên nhóm Theo dõi/Mục tiêu (ANOMALY_LEAKAGE, PERIODIC_PULSE, GOAL_PROGRESS) có category khác Slide 1.
 * - Slide 3: Ưu tiên nhóm Tối ưu/Ghi nhận/Khám phá & Bảo mật (OPTIMIZATION, RECOGNITION_RECAP, DISCOVERY_GUIDE) có category khác Slide 1 & 2.
 * - Critical Exception: Nếu có >= 2 hoặc 3 khoản khẩn cấp priority === 0, cả các slide ưu tiên hiển thị chúng.
 * - Fallback filling: Nếu < 3 ứng viên thực tế, bổ sung từ FALLBACK_CANDIDATES để luôn đủ 3 Slide giá trị.
 */
export function selectTop3DiverseCandidates(candidates: SnapshotCandidate[]): SnapshotCandidate[] {
  const pool = [...candidates];
  const selected: SnapshotCandidate[] = [];

  // Critical exception: If >= 3 priority 0 candidates exist, show all 3
  const priorityZero = pool.filter((c) => c.priority === 0);
  if (priorityZero.length >= 3) {
    return priorityZero.slice(0, 3);
  }

  // Slide 1: Highest priority candidate, favoring PROTECT (UPCOMING_OBLIGATION, CASHFLOW_RISK)
  let slide1: SnapshotCandidate | undefined;
  if (priorityZero.length > 0) {
    slide1 = priorityZero[0];
  } else {
    const protectTop = pool.find(
      (c) => (c.category === "UPCOMING_OBLIGATION" || c.category === "CASHFLOW_RISK") && c.priority <= 2
    );
    slide1 = protectTop ?? pool[0];
  }

  if (slide1) {
    selected.push(slide1);
  }

  // Slide 2: Favor Monitoring / Goals (ANOMALY_LEAKAGE, PERIODIC_PULSE, GOAL_PROGRESS) with category != slide1
  if (priorityZero.length >= 2) {
    selected.push(priorityZero[1]);
  } else {
    const slide2Candidate =
      pool.find(
        (c) =>
          !selected.some((s) => s.id === c.id) &&
          c.category !== selected[0]?.category &&
          (c.category === "ANOMALY_LEAKAGE" || c.category === "PERIODIC_PULSE" || c.category === "GOAL_PROGRESS")
      ) ??
      pool.find(
        (c) =>
          !selected.some((s) => s.id === c.id) &&
          c.category !== selected[0]?.category
      ) ??
      pool.find((c) => !selected.some((s) => s.id === c.id));

    if (slide2Candidate) {
      selected.push(slide2Candidate);
    }
  }

  // Slide 3: Favor Optimization / Recap / Discovery & Security (OPTIMIZATION, RECOGNITION_RECAP, DISCOVERY_GUIDE) with distinct category
  const usedCategories = new Set(selected.map((s) => s.category));
  const slide3Candidate =
    pool.find(
      (c) =>
        !selected.some((s) => s.id === c.id) &&
        !usedCategories.has(c.category) &&
        (c.category === "OPTIMIZATION" || c.category === "RECOGNITION_RECAP" || c.category === "DISCOVERY_GUIDE")
    ) ??
    pool.find(
      (c) =>
        !selected.some((s) => s.id === c.id) &&
        !usedCategories.has(c.category)
    ) ??
    pool.find((c) => !selected.some((s) => s.id === c.id));

  if (slide3Candidate) {
    selected.push(slide3Candidate);
  }

  // If < 3 candidates, fill from FALLBACK_CANDIDATES
  if (selected.length < 3) {
    for (const fb of FALLBACK_CANDIDATES) {
      if (selected.length >= 3) break;
      if (!selected.some((s) => s.id === fb.id || s.category === fb.category)) {
        selected.push(fb);
      }
    }
  }

  if (selected.length < 3) {
    for (const fb of FALLBACK_CANDIDATES) {
      if (selected.length >= 3) break;
      if (!selected.some((s) => s.id === fb.id)) {
        selected.push(fb);
      }
    }
  }

  return selected.slice(0, 3);
}

export const ALL_CLEAR_SECURITY_CANDIDATE: SnapshotCandidate = {
  id: "security:all_clear",
  topic: "spending",
  domain: "SECURITY",
  securityLevel: "GREEN",
  scenarioCode: "ALL_CLEAR",
  category: "SECURITY_GREEN",
  categoryLabel: "An toàn",
  slotGroup: "GROW_AND_GUIDE",
  tone: "security",
  priority: 10,
  severity: "info",
  confidence: "recorded",
  title: "Tài khoản đang được Khiên bảo vệ M-Your canh gác 24/7.",
  body: "Mọi giao dịch và đăng nhập gần đây đều an toàn, chưa phát hiện dấu hiệu bất thường.",
  impactLine: "Mọi giao dịch và đăng nhập gần đây đều an toàn, chưa phát hiện dấu hiệu bất thường.",
  badgeText: "An toàn",
  actionType: "navigate_security_hub",
  actionHref: "/settings/security",
  actionLabel: "Trung tâm bảo mật",
  primaryAction: { type: "navigate_security_hub", label: "Trung tâm bảo mật", href: "/settings/security" },
  chips: [
    { label: "Trung tâm bảo mật", actionType: "navigate_security_hub", href: "/settings/security", variant: "primary" },
    { label: "Xem cẩm nang bảo mật", actionType: "open_security_handbook", variant: "secondary" },
  ],
  metric: { label: "Mức độ an toàn", value: 100, unit: "percent" },
  facts: { safe: true },
  action: "overview",
  question: "Khiên bảo vệ M-Your đang bảo vệ những gì cho tài khoản của tôi?",
};

export const FALLBACK_PFM_CANDIDATE: SnapshotCandidate = {
  id: "pulse:steady_state",
  topic: "spending",
  domain: "PFM",
  category: "PERIODIC_PULSE",
  categoryLabel: "Nhịp tiền định kỳ",
  slotGroup: "GROW_AND_GUIDE",
  tone: "info",
  priority: 99,
  severity: "info",
  confidence: "recorded",
  title: "Nhịp chi tiêu tuần này đang được duy trì ổn định.",
  body: "Các hũ ngân sách và dòng tiền đều nằm trong ngưỡng an toàn.",
  impactLine: "Các hũ ngân sách và dòng tiền đều nằm trong ngưỡng an toàn.",
  badgeText: "Ổn định",
  actionType: "navigate_pfm",
  actionHref: "/pfm",
  actionLabel: "Xem tổng quan",
  primaryAction: { type: "navigate_pfm", label: "Xem tổng quan", href: "/pfm" },
  chips: [
    { label: "Xem tổng quan", actionType: "navigate_pfm", href: "/pfm", variant: "primary" },
  ],
  metric: { label: "Trạng thái chi tiêu", value: 100, unit: "percent" },
  facts: { steady: true },
  action: "overview",
  question: "Tóm tắt tình hình chi tiêu và nhịp dòng tiền tuần này của tôi.",
};

export function getDefaultChipsForPfm(candidate: SnapshotCandidate): InsightActionChip[] {
  if (candidate.chips && candidate.chips.length > 0) return candidate.chips;
  switch (candidate.category) {
    case "UPCOMING_OBLIGATION":
      return [{ label: "Thanh toán ngay", actionType: "navigate_transfer", href: "/transfer", variant: "primary" }];
    case "CASHFLOW_RISK":
      return [{ label: "Bù tiền hũ", actionType: "open_jar_transfer", variant: "primary" }];
    case "ANOMALY_LEAKAGE":
      return [{ label: "Xem chi tiết", actionType: "navigate_pfm", href: "/pfm", variant: "primary" }];
    case "GOAL_PROGRESS":
      return [{ label: "Xem mục tiêu", actionType: "navigate_goals", href: "/goals", variant: "primary" }];
    case "OPTIMIZATION":
      return [{ label: "Tối ưu cùng M-Your", actionType: "chat_handoff", variant: "primary" }];
    case "PERIODIC_PULSE":
      return [{ label: "Xem tổng quan", actionType: "navigate_pfm", href: "/pfm", variant: "primary" }];
    case "RECOGNITION_RECAP":
      return [{ label: "Xem hành trình", actionType: "navigate_wrapped", href: "/wrapped", variant: "primary" }];
    case "DISCOVERY_GUIDE":
      return [{ label: "Khám phá", actionType: "navigate_pfm", href: "/pfm", variant: "primary" }];
    default:
      return [{ label: "Xem chi tiết", actionType: "navigate_pfm", href: "/pfm", variant: "primary" }];
  }
}

/**
 * 5-Slide Carousel Orchestration:
 * [Security Đỏ / Vàng (0..2)] -> [PFM (1..3)] -> [Security Xanh (0..2)]
 * Total count: 2 to 5 slides.
 */
export function selectOrderedHomeCandidates(candidates: SnapshotCandidate[]): SnapshotCandidate[] {
  // 1. PFM: domain === 'PFM' or undefined
  const pfmCandidates = candidates.filter((c) => c.domain === "PFM" || (!c.domain && !c.id.startsWith("security:")));
  pfmCandidates.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const selectedPfm: SnapshotCandidate[] = [];
  const seenCategories = new Set<string>();

  for (const c of pfmCandidates) {
    const cat = c.category ?? c.topic;
    if (!seenCategories.has(cat)) {
      seenCategories.add(cat);
      selectedPfm.push({
        ...c,
        domain: "PFM",
        chips: c.chips ?? getDefaultChipsForPfm(c),
      });
      if (selectedPfm.length === 3) break;
    }
  }

  if (selectedPfm.length < 3) {
    const selectedIds = new Set(selectedPfm.map((c) => c.id));
    for (const c of pfmCandidates) {
      if (!selectedIds.has(c.id)) {
        selectedIds.add(c.id);
        selectedPfm.push({
          ...c,
          domain: "PFM",
          chips: c.chips ?? getDefaultChipsForPfm(c),
        });
        if (selectedPfm.length === 3) break;
      }
    }
  }

  if (selectedPfm.length === 0) {
    selectedPfm.push(FALLBACK_PFM_CANDIDATE);
  }

  // 2. SECURITY: domain === 'SECURITY' or id starts with 'security:'
  const secCandidates = candidates.filter((c) => c.domain === "SECURITY" || c.id.startsWith("security:"));
  const levelPriority = { RED: 0, AMBER: 1, GREEN: 2 };
  secCandidates.sort((a, b) => {
    const la = a.securityLevel ? levelPriority[a.securityLevel] : 3;
    const lb = b.securityLevel ? levelPriority[b.securityLevel] : 3;
    if (la !== lb) return la - lb;
    return a.priority - b.priority || a.id.localeCompare(b.id);
  });

  let selectedSecurity = secCandidates.slice(0, 2);
  if (selectedSecurity.length === 0) {
    selectedSecurity = [ALL_CLEAR_SECURITY_CANDIDATE];
  }

  // 3. Partition security into urgent (RED / AMBER) and green (GREEN)
  const urgentSecurity = selectedSecurity.filter(
    (c) => c.securityLevel === "RED" || c.securityLevel === "AMBER"
  );
  const greenSecurity = selectedSecurity.filter(
    (c) => c.securityLevel === "GREEN" || !c.securityLevel
  );

  // 4. Return [urgentSecurity] -> [selectedPfm] -> [greenSecurity], clamped at 5
  return [...urgentSecurity, ...selectedPfm, ...greenSecurity].slice(0, 5);
}

/** Legacy 2-candidate diversity algorithm for backward compatibility */
export function selectDiverseTopCandidates(candidates: SnapshotCandidate[]): SnapshotCandidate[] {
  return selectTop3DiverseCandidates(candidates).slice(0, 2);
}

export interface SnapshotOverlay {
  assets: Asset[];
  liabilities: Liability[];
  goals: Goal[];
  complete: boolean;
}
const DAY = 86_400_000;
export function vnDate(iso: string): string {
  return new Date(Date.parse(iso) + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}
const round = (n: number) => Math.round(n);

export function buildCustomerSnapshot(raw: RawData, jarConfig: JarConfig, categories: StoredCategory[],
  overlay: SnapshotOverlay, sessionTopups: Transaction[], now: Date, securitySummary?: SecuritySummaryInput) {
  const asOf = now.toISOString();
  const today = vnDate(asOf);
  const month = dateToMonthKey(now);
  // Demo clock identifies a reporting DAY. Include that entire VN day, never future days.
  const dayStart = Date.parse(`${today}T00:00:00+07:00`);
  const dayEnd = dayStart + DAY - 1;
  const txns = [...raw.transactions, ...sessionTopups].filter((t) => Date.parse(t.postedAt) <= dayEnd);
  const fin = computeFinancials(raw, month, { transactions: txns, now, jarConfig, categories,
    userAssets: overlay.assets, userLiabilities: overlay.liabilities, userGoals: overlay.goals });
  const liabilities = [...raw.liabilities, ...overlay.liabilities];
  const assets = [...raw.assets, ...overlay.assets];
  const goals = fin.goals;
  const fixed = new Set(categories.filter((c) => c.fixed).map((c) => c.id));
  const period = (days: number): Period => ({ from: new Date(dayStart - (days - 1) * DAY).toISOString(),
    to: new Date(dayEnd).toISOString(), label: `last_${days}_days` });
  const cash = (p: Period) => aggregateCashflow(txns, p, fixed);
  const todayCash = cash(period(1));
  const previousMonth = addMonthsToKey(month, -1);
  const priorPeriod = monthPeriodFromKey(previousMonth);
  const priorDayCount = Math.min(Number(today.slice(-2)), new Date(Date.parse(priorPeriod.to) + VN_UTC_OFFSET_MS).getUTCDate());
  const priorComparable = cash({ ...priorPeriod,
    to: new Date(Date.parse(priorPeriod.from) + priorDayCount * DAY - 1).toISOString() });
  const last7 = netExpenseByCategory(txns, period(7));
  const last30 = netExpenseByCategory(txns, period(30));
  const casaAccounts = raw.accounts.filter((a) => a.type === "current");
  const casaBalance = casaAccounts.reduce((sum, a) => sum + (a.availableBalance ?? a.balance), 0);

  const candidates: SnapshotCandidate[] = [];
  // A liability's minimum payment is never relabelled as a full card statement.
  const payments = liabilities.flatMap((l) => {
    if (!l.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(l.dueDate)) return [];
    const due = Date.parse(`${l.dueDate}T00:00:00+07:00`);
    if (!Number.isFinite(due) || vnDate(new Date(due).toISOString()) !== l.dueDate) return [];
    const days = round((due - dayStart) / DAY);
    return days >= 0 && days <= 30 ? [{ id: l.id, label: l.name, amount: l.minimumPayment,
      dueDate: l.dueDate, daysUntilDue: days, amountMeaning: "minimum_payment", source: l.source }] : [];
  });
  payments.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const bills = fin.obligations.filter((o) => o.kind === "recurring")
    .map((o) => ({ ...o, source: "estimated" as const, amountMeaning: "predicted_recurring_bill" }));
  const dueSoon = payments.filter((p) => p.amount !== null && p.amount > 0 && p.daysUntilDue <= 7);
  const dueAmount = dueSoon.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  // Nhóm 1: UPCOMING_OBLIGATION - Thẻ / Khoản vay đến hạn
  if (dueAmount > 0) {
    const isSufficient = casaBalance >= dueAmount;
    const shortfall = Math.max(0, dueAmount - casaBalance);
    const impactLine = isSufficient
      ? "Số dư hiện đủ trả."
      : `Số dư hiện thiếu khoảng ${formatVndVietnamese(shortfall)} để tất toán.`;
    const badgeText = dueSoon[0].daysUntilDue === 0 ? "Hôm nay" : `Còn ${dueSoon[0].daysUntilDue} ngày`;

    candidates.push({
      id: "payment:next7",
      topic: "payment",
      category: "UPCOMING_OBLIGATION",
      categoryLabel: "Nghĩa vụ sắp đến hạn",
      slotGroup: "PROTECT",
      tone: "urgent",
      priority: 0,
      severity: "urgent",
      confidence: "recorded",
      title: "Sắp đến hạn thanh toán tối thiểu",
      body: "Kiểm tra lịch trả và số tiền tối thiểu đã ghi nhận trước ngày đến hạn.",
      impactLine,
      badgeText,
      actionType: "navigate_transfer",
      actionHref: "/transfer",
      primaryAction: {
        type: "navigate_transfer",
        label: "Thanh toán ngay",
        href: "/transfer",
      },
      metric: { label: "Thanh toán tối thiểu trong bảy ngày", value: dueAmount, unit: "VND" },
      facts: {
        rule_id: "known_payment_due_reminder",
        minimum_due: dueAmount,
        count: dueSoon.length,
        nearest_due: dueSoon[0].dueDate,
        casa_balance: casaBalance,
        is_sufficient: isSufficient,
        shortfall,
        items: dueSoon.map(p => ({ id: p.id, label: p.label, amount: p.amount, due: p.dueDate, days_until_due: p.daysUntilDue })),
      },
      action: "overview",
      question: "Giúp tôi xem các khoản sắp phải trả: từng khoản vay/thẻ nào, số tiền tối thiểu bao nhiêu, ngày đến hạn, và phân biệt trả tối thiểu với trả toàn bộ.",
    });
  }

  // Nhóm 1: UPCOMING_OBLIGATION - Hóa đơn định kỳ dự kiến
  const predictedSoon = bills.filter((b) => Date.parse(b.dueDate) >= dayStart && Date.parse(b.dueDate) <= dayEnd + 7 * DAY && typeof b.amount === "number");
  const billAmount = predictedSoon.reduce((sum, b) => sum + (typeof b.amount === "number" ? b.amount : 0), 0);
  if (billAmount > 0) {
    const isBillSufficient = casaBalance >= billAmount;
    const billShortfall = Math.max(0, billAmount - casaBalance);
    const billImpact = isBillSufficient
      ? "Số dư hiện đủ trả."
      : `Số dư hiện thiếu khoảng ${formatVndVietnamese(billShortfall)} để tất toán.`;

    candidates.push({
      id: "payment:bills",
      topic: "payment",
      category: "UPCOMING_OBLIGATION",
      categoryLabel: "Nghĩa vụ sắp đến hạn",
      slotGroup: "PROTECT",
      tone: "warning",
      priority: 1,
      severity: "attention",
      confidence: "estimated",
      title: "Dự kiến có hóa đơn sắp tới",
      body: "Lịch chi định kỳ gợi ý bạn nên kiểm tra hóa đơn và để dành tiền thanh toán.",
      impactLine: billImpact,
      badgeText: `${predictedSoon.length} hóa đơn`,
      actionType: "navigate_transfer",
      actionHref: "/transfer",
      primaryAction: {
        type: "navigate_transfer",
        label: "Thanh toán ngay",
        href: "/transfer",
      },
      metric: { label: "Hóa đơn ước tính trong bảy ngày", value: round(billAmount), unit: "VND" },
      facts: {
        estimated_bill_total: round(billAmount),
        count: predictedSoon.length,
        items: predictedSoon.map(b => ({ label: b.label ?? b.id, amount: typeof b.amount === "number" ? round(b.amount) : null, due: b.dueDate })),
      },
      action: "overview",
      question: "Giúp tôi kiểm tra các hóa đơn định kỳ dự kiến: từng hóa đơn tên gì, số tiền bao nhiêu, ngày nào, và khoản nào đã được xác nhận thực sự.",
    });
  }

  // Nhóm 1: UPCOMING_OBLIGATION - Sổ tiết kiệm / Tiền gửi sắp đáo hạn
  const maturingAssets = assets.filter((a) => {
    const mat = (a as unknown as { maturityDate?: string }).maturityDate;
    if (!mat || !/^\d{4}-\d{2}-\d{2}$/.test(mat)) return false;
    const due = Date.parse(`${mat}T00:00:00+07:00`);
    if (!Number.isFinite(due)) return false;
    const days = round((due - dayStart) / DAY);
    return days >= 0 && days <= 7;
  });
  if (maturingAssets.length > 0) {
    const topMat = maturingAssets[0];
    const matDate = (topMat as unknown as { maturityDate: string }).maturityDate;
    const daysUntil = round((Date.parse(`${matDate}T00:00:00+07:00`) - dayStart) / DAY);
    candidates.push({
      id: `obligation:fd_maturing:${topMat.id}`,
      topic: "payment",
      category: "UPCOMING_OBLIGATION",
      categoryLabel: "Nghĩa vụ sắp đến hạn",
      slotGroup: "PROTECT",
      tone: "info",
      priority: 1,
      severity: "attention",
      confidence: "recorded",
      title: `Sổ tiết kiệm "${topMat.name}" sắp đáo hạn`,
      body: `Khoản tiền gửi ${formatVndVietnamese(topMat.value ?? 0)} sắp đến ngày đáo hạn (${matDate}).`,
      impactLine: "Sắp đáo hạn, có thể chọn tự động tái tục hoặc nhận về tài khoản.",
      badgeText: daysUntil === 0 ? "Đáo hạn hôm nay" : `Còn ${daysUntil} ngày`,
      actionType: "navigate_pfm",
      actionHref: "/pfm",
      primaryAction: {
        type: "navigate_pfm",
        label: "Xem chi tiết sổ",
        href: "/pfm",
      },
      metric: { label: `Tiền gửi · ${topMat.name}`, value: topMat.value ?? 0, unit: "VND" },
      facts: { asset_id: topMat.id, maturity_date: matDate, days_until: daysUntil },
      action: "overview",
      question: `Sổ tiết kiệm ${topMat.name} của tôi sắp đáo hạn ngày ${matDate}. Hãy tư vấn các lựa chọn tái tục hoặc chuyển sang kênh sinh lời khác.`,
    });
  }

  // Nhóm 2: CASHFLOW_RISK - Áp lực hũ chi tiêu
  const jars = fin.jarBudget.lines.map((line) => {
    const activeDays = new Set(txns.filter((t) => t.status === "posted" &&
      (t.type === "expense" || t.type === "fee") && line.categoryIds.includes(t.categoryId) &&
      Date.parse(t.postedAt) >= Date.parse(period(30).from)).map((t) => vnDate(t.postedAt))).size;
    const variable = line.categoryIds.length > 0 && !line.categoryIds.some((id) => fixed.has(id));
    const burn = variable && activeDays >= 3 ? Math.max(0,
      0.6 * line.categoryIds.reduce((s, id) => s + (last7.get(id) ?? 0), 0) / 7 +
      0.4 * line.categoryIds.reduce((s, id) => s + (last30.get(id) ?? 0), 0) / 30) : null;
    const remaining = line.balance;
    const limit = line.limit;
    const hasLimit = typeof limit === "number" && limit > 0;
    const isOverLimit = hasLimit && line.spent > limit;
    const isNearLimit = hasLimit && !isOverLimit && line.spent >= limit * 0.8;
    const isNeedsCover = remaining !== null && remaining < 0;
    const burnRisk = remaining !== null && remaining > 0 && burn !== null && burn * fin.jarBudget.summary.daysLeft > remaining;
    const pressure = isNeedsCover || isOverLimit || isNearLimit;

    // Prior month spend for this jar's categories
    const priorMonthTxns = txns.filter(t => Date.parse(t.postedAt) >= Date.parse(priorPeriod.from) && Date.parse(t.postedAt) <= Date.parse(priorPeriod.to));
    const priorMonthByCategory = netExpenseByCategory(priorMonthTxns, { from: priorPeriod.from, to: priorPeriod.to, label: "prior" });
    const priorMonthSpend = line.categoryIds.reduce((s, id) => s + (priorMonthByCategory.get(id) ?? 0), 0);

    if (pressure || burnRisk) {
      let semanticState: "needs_cover" | "over_limit_covered" | "near_limit" | "burn_risk" = "near_limit";
      let title = `Hũ "${line.label}" đang gần hạn mức`;
      let body = "Xem lại chi tiêu trong hũ và trao đổi với M-Your về cách điều chỉnh phù hợp.";
      let severity: "urgent" | "attention" = "attention";
      let impactLine = "Xem lại chi tiêu trong hũ và điều chỉnh phù hợp.";
      let badgeText = "Chi tiêu hũ";
      let tone: InsightTone = "warning";

      if (isNeedsCover) {
        semanticState = "needs_cover";
        severity = "urgent";
        tone = "urgent";
        title = `Hũ "${line.label}" đang cần bù`;
        body = "Hũ này đã chi quá số dư hiện có và cần được bù từ các nguồn khác.";
        impactLine = `Hũ đã chi quá số dư hiện có ${formatVndVietnamese(Math.abs(remaining ?? 0))}.`;
        badgeText = "Cần bù gấp";
      } else if (isOverLimit) {
        semanticState = "over_limit_covered";
        severity = "attention";
        tone = "warning";
        title = `Hũ "${line.label}" vượt hạn mức tháng`;
        body = "Chi tiêu trong tháng đã vượt hạn mức kế hoạch nhưng số dư hũ vẫn được duy trì.";
        impactLine = "Đã chi vượt hạn mức tháng nhưng vẫn duy trì số dư.";
        badgeText = "Vượt hạn mức";
      } else if (isNearLimit) {
        semanticState = "near_limit";
        severity = "attention";
        tone = "warning";
        title = `Hũ "${line.label}" đang gần hạn mức`;
        body = "Xem lại chi tiêu trong hũ và trao đổi với M-Your về cách điều chỉnh phù hợp.";
        const pct = hasLimit ? Math.round((line.spent / limit) * 100) : 85;
        impactLine = `Đã sử dụng ${pct}% hạn mức kế hoạch tháng.`;
        badgeText = `Đạt ${pct}%`;
      } else if (burnRisk) {
        semanticState = "burn_risk";
        severity = "attention";
        tone = "warning";
        title = `Hũ "${line.label}" có thể cạn trước cuối tháng`;
        body = "Nhịp chi gần đây có thể khiến hũ hết sớm. Cùng M-Your xem khoản nào có thể điều chỉnh.";
        impactLine = "Với nhịp chi gần đây, hũ có thể cạn trước cuối tháng.";
        badgeText = "Nguy cơ cạn sớm";
      }

      candidates.push({
        id: `spending:jar:${line.huId}`,
        topic: "spending",
        category: "CASHFLOW_RISK",
        categoryLabel: "Rủi ro dòng tiền",
        slotGroup: "PROTECT",
        tone,
        priority: 1,
        severity,
        confidence: burnRisk && !pressure ? "estimated" : "recorded",
        title,
        body,
        impactLine,
        badgeText,
        actionType: "open_jar_transfer",
        primaryAction: {
          type: "open_jar_transfer",
          label: isNeedsCover ? "Bù tiền ngay" : "Bù tiền giữa các hũ",
          payload: { jarId: line.huId },
        },
        metric: {
          label: isNeedsCover ? `Cần bù · ${line.label}` : `Còn lại · ${line.label}`,
          value: round(isNeedsCover ? -remaining : (remaining ?? 0)),
          unit: "VND",
        },
        facts: {
          rule_id: "jar_plan_pressure",
          semantic_state: semanticState,
          jar_id: line.huId,
          jar_label: line.label,
          remaining,
          spent: line.spent,
          limit: line.limit,
          daily_burn: burn === null ? null : round(burn),
          days_left: fin.jarBudget.summary.daysLeft,
          days_to_empty: burn && remaining !== null && remaining > 0 ? Math.floor(remaining / burn) : null,
          prior_month_spend: round(priorMonthSpend),
          mom_delta: line.spent !== null && priorMonthSpend > 0 ? round(line.spent - priorMonthSpend) : null,
          active_days_last30: activeDays,
          source: line.source,
          freshness: line.freshness,
        },
        action: "chat",
        question: `Phân tích hũ ${line.label} cho tôi: đã chi bao nhiêu, trung bình mỗi ngày bao nhiêu, so với tháng trước thế nào, còn lại bao nhiêu và dự báo có hết trước cuối tháng không. Các khoản chi nổi bật là gì? Gợi ý cách điều chỉnh nhưng hỏi tôi trước khi đề xuất chuyển tiền giữa các hũ.`,
      });
    }
    return { ...line, estimatedDailyBurn: burn === null ? null : round(burn), activeDays,
      burnRisk, forecastCoverage: variable ? activeDays >= 3 ? "sufficient" : "sparse" : "fixed_or_empty_categories" };
  });

  // Nhóm 2: CASHFLOW_RISK - Dự báo số dư cuối tháng eo hẹp
  const safeThreshold = 3_000_000;
  if (typeof fin.endOfMonth.value === "number" && fin.endOfMonth.value < safeThreshold) {
    const projected = fin.endOfMonth.value;
    const isNegative = projected < 0;
    candidates.push({
      id: "cashflow:end_of_month_risk",
      topic: "spending",
      category: "CASHFLOW_RISK",
      categoryLabel: "Rủi ro dòng tiền",
      slotGroup: "PROTECT",
      tone: isNegative ? "urgent" : "warning",
      priority: 1,
      severity: isNegative ? "urgent" : "attention",
      confidence: "estimated",
      title: "Dự báo số dư cuối tháng eo hẹp",
      body: `Với nhịp chi hiện tại, cuối tháng bạn còn khoảng ${formatVndVietnamese(projected)}, dưới ngưỡng an toàn 3 triệu.`,
      impactLine: `Dưới ngưỡng an toàn ${formatVndVietnamese(safeThreshold - projected)}.`,
      badgeText: "Dưới ngưỡng an toàn",
      metric: { label: "Dự báo số dư cuối tháng", value: projected, unit: "VND" },
      facts: {
        projected_balance: projected,
        safe_threshold: safeThreshold,
        shortfall_to_safe: Math.max(0, safeThreshold - projected),
      },
      actionType: "navigate_pfm",
      actionHref: "/pfm",
      primaryAction: {
        type: "navigate_pfm",
        label: "Kiểm tra dòng tiền",
        href: "/pfm",
      },
      action: "overview",
      question: `Với nhịp chi hiện tại, cuối tháng tôi còn khoảng ${formatVndVietnamese(projected)}. Cùng xem nguyên nhân và các khoản có thể điều chỉnh để về đích an toàn.`,
    });
  }

  // Nhóm 3: ANOMALY_LEAKAGE - Chi hôm nay tăng đột biến
  const baseline = Math.max(0, cash(period(30)).expense - todayCash.expense) / 29;
  if (baseline > 0 && todayCash.expense > baseline * 1.5 && todayCash.expense - baseline >= 200_000) {
    candidates.push({
      id: "spending:today",
      topic: "spending",
      category: "ANOMALY_LEAKAGE",
      categoryLabel: "Bất thường & rò rỉ",
      slotGroup: "PROTECT",
      tone: "warning",
      priority: 2,
      severity: "attention",
      confidence: "estimated",
      title: "Chi tiêu hôm nay cao hơn thường lệ",
      body: "Cùng M-Your xem những khoản chi làm hôm nay khác với nhịp chi gần đây.",
      impactLine: "Chi hôm nay cao hơn 1,5 lần trung bình 30 ngày qua.",
      badgeText: "Chi hôm nay tăng",
      actionType: "navigate_pfm",
      actionHref: "/pfm",
      primaryAction: {
        type: "navigate_pfm",
        label: "Rà soát các khoản chi",
        href: "/pfm",
      },
      metric: { label: "Đã chi hôm nay", value: todayCash.expense, unit: "VND" },
      facts: { today_spend: todayCash.expense, daily_baseline: round(baseline) },
      action: "chat",
      question: "Hôm nay tôi chi nhiều ở đâu? Phân tích các khoản lớn và gợi ý điều chỉnh, không suy đoán nguyên nhân khi chưa có dữ liệu.",
    });
  }

  // Nhóm 3: ANOMALY_LEAKAGE - Chi tiêu tháng này tăng mạnh so với cùng kỳ
  if (priorComparable.expense > 0 && fin.cashflow.expense > priorComparable.expense * 1.3 &&
    fin.cashflow.expense - priorComparable.expense >= 500_000) {
    const momPct = round((fin.cashflow.expense / priorComparable.expense - 1) * 100);
    candidates.push({
      id: "spending:month",
      topic: "spending",
      category: "ANOMALY_LEAKAGE",
      categoryLabel: "Bất thường & rò rỉ",
      slotGroup: "PROTECT",
      tone: "warning",
      priority: 2,
      severity: "attention",
      confidence: "recorded",
      title: "Chi tháng này đang tăng",
      body: "Chi tiêu từ đầu tháng cao hơn cùng kỳ tháng trước. Cùng xem các danh mục đóng góp nhiều nhất.",
      impactLine: `Tăng ${momPct}% so với cùng kỳ tháng trước.`,
      badgeText: `+${momPct}% cùng kỳ`,
      actionType: "navigate_pfm",
      actionHref: "/pfm",
      primaryAction: {
        type: "navigate_pfm",
        label: "Rà soát các khoản chi",
        href: "/pfm",
      },
      metric: { label: "Đã chi từ đầu tháng", value: fin.cashflow.expense, unit: "VND" },
      facts: {
        rule_id: "spending_spike",
        current_spend: fin.cashflow.expense,
        previous_comparable_spend: priorComparable.expense,
        mom_delta: round(fin.cashflow.expense - priorComparable.expense),
        mom_pct: momPct,
      },
      action: "chat",
      question: "So sánh chi tiêu tháng này với cùng kỳ tháng trước: tổng đã chi bao nhiêu, tăng bao nhiêu (cả số tiền lẫn %), danh mục nào tăng nhiều nhất, và gợi ý các khoản tôi có thể điều chỉnh.",
    });
  }

  // Nhóm 3: ANOMALY_LEAKAGE - Nhận khoản hoàn tiền
  const recentRefunds = txns
    .filter((t) => t.status === "posted" && t.type === "refund" &&
      Date.parse(t.postedAt) >= dayStart - 2 * DAY && Date.parse(t.postedAt) <= dayEnd)
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  if (recentRefunds.length > 0) {
    const latestRefund = recentRefunds[0];
    candidates.push({
      id: `refund:${latestRefund.id}`,
      topic: "spending",
      category: "ANOMALY_LEAKAGE",
      categoryLabel: "Bất thường & rò rỉ",
      slotGroup: "PROTECT",
      tone: "info",
      priority: 3,
      severity: "info",
      confidence: "recorded",
      title: "Đã nhận khoản hoàn tiền",
      body: "Khoản hoàn tiền đã được ghi nhận và tự động cấn trừ vào danh mục chi tiêu tương ứng.",
      impactLine: "Khoản hoàn tiền đã được cấn trừ vào danh mục chi tiêu.",
      badgeText: "Đã hoàn tất",
      actionType: "navigate_pfm",
      actionHref: "/pfm",
      primaryAction: {
        type: "navigate_pfm",
        label: "Xem chi tiết",
        href: "/pfm",
      },
      metric: {
        label: "Tiền hoàn lại",
        value: round(latestRefund.amount),
        unit: "VND",
      },
      facts: {
        rule_id: "refund_received",
        transaction_id: latestRefund.id,
        related_transaction_id: latestRefund.relatedTransactionId ?? null,
        amount: latestRefund.amount,
        posted_at: latestRefund.postedAt,
        merchant: latestRefund.merchantName,
        source: latestRefund.source,
      },
      action: "overview",
      question: "Chi tiết khoản hoàn tiền này thế nào? Đã trừ vào danh mục chi tiêu nào?",
    });
  }

  // Nhóm 3: ANOMALY_LEAKAGE - Thuê bao & dịch vụ định kỳ
  const recurringCount = fin.recurring.length;
  const recurringTotal = fin.recurring.reduce((s, r) => s + (typeof r.averageAmount === "number" ? r.averageAmount : 0), 0);
  if (recurringCount >= 2 && recurringTotal > 0) {
    candidates.push({
      id: "leakage:subscriptions",
      topic: "spending",
      category: "ANOMALY_LEAKAGE",
      categoryLabel: "Bất thường & rò rỉ",
      slotGroup: "PROTECT",
      tone: "warning",
      priority: 2,
      severity: "attention",
      confidence: "estimated",
      title: "Theo dõi các dịch vụ định kỳ",
      body: `Tháng này bạn có ${recurringCount} khoản định kỳ/thuê bao, tổng ${formatVndVietnamese(recurringTotal)}/tháng.`,
      impactLine: `Tổng ${recurringCount} khoản thuê bao, khoảng ${formatVndVietnamese(recurringTotal)}/tháng.`,
      badgeText: `${recurringCount} thuê bao`,
      actionType: "navigate_pfm",
      actionHref: "/pfm",
      primaryAction: {
        type: "navigate_pfm",
        label: "Rà soát thuê bao",
        href: "/pfm",
      },
      metric: { label: "Tổng chi phí định kỳ", value: round(recurringTotal), unit: "VND" },
      facts: {
        subscription_count: recurringCount,
        monthly_total: round(recurringTotal),
      },
      action: "overview",
      question: "Tôi có những khoản thanh toán hoặc thuê bao định kỳ nào trong tháng này? Tổng chi phí là bao nhiêu và có khoản nào không còn cần thiết không?",
    });
  }

  // Nhóm 4: GOAL_PROGRESS - Tiến độ mục tiêu
  if (goals.length > 0) {
    for (const g of goals) {
      if (g.targetAmount > 0) {
        const pct = Math.round((g.currentAmount / g.targetAmount) * 100);
        if (pct >= 25) {
          candidates.push({
            id: `goal:progress:${g.id}`,
            topic: "allocation",
            category: "GOAL_PROGRESS",
            categoryLabel: "Tiến độ mục tiêu",
            slotGroup: "GROW_AND_GUIDE",
            tone: "positive",
            priority: pct >= 50 ? 2 : 3,
            severity: "info",
            confidence: "recorded",
            title: `Mục tiêu "${g.name}" đạt mốc ${pct}%`,
            body: `Đã tích lũy ${formatVndVietnamese(g.currentAmount)} trên tổng ${formatVndVietnamese(g.targetAmount)}. Giữ nhịp để về đích đúng hẹn.`,
            impactLine: `Đã đạt ${pct}% kế hoạch, duy trì nhịp tích lũy rất tốt.`,
            badgeText: `Đạt ${pct}%`,
            progressPct: Math.min(100, Math.max(0, pct)),
            actionType: "navigate_goals",
            actionHref: "/goals",
            primaryAction: {
              type: "navigate_goals",
              label: "Xem mục tiêu",
              href: "/goals",
            },
            metric: { label: `Tích lũy · ${g.name}`, value: g.currentAmount, unit: "VND" },
            facts: { goal_id: g.id, goal_name: g.name, current_amount: g.currentAmount, target_amount: g.targetAmount, pct },
            action: "overview",
            question: `Mục tiêu ${g.name} của tôi đã đạt ${pct}%. Với tốc độ tích lũy hiện tại, tôi có về đích đúng hẹn không?`,
          });
          break;
        }
      }
    }
  }

  const pool = fin.unallocatedPool.amount === "unknown" ? null : fin.unallocatedPool.amount;
  const dueReserve = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const estimatedBillReserve = bills.reduce((sum, p) => sum + (typeof p.amount === "number" ? p.amount : 0), 0);
  const goalReserve = goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount), 0);
  const buffer = Math.max(10_000_000, Math.max(fin.cashflow.expense, fin.prevCashflow.expense) * 3);
  const debtsKnown = liabilities.every((l) => l.outstandingPrincipal !== null &&
    (l.outstandingPrincipal === 0 || (l.minimumPayment !== null && l.minimumPayment > 0 && l.interestRate !== null &&
      l.interestRate < 0.2 && l.dueDate !== null && Date.parse(`${l.dueDate}T23:59:59+07:00`) >= dayStart)));
  const eligible = overlay.complete && debtsKnown && pool !== null && fin.prevCashflow.expense > 0 &&
    jars.every((j) => j.categoryIds.length === 0 || (j.limit !== null && j.balance !== null && j.balance >= 0)) &&
    !candidates.some((c) => c.priority <= 2) && fin.unlabeled.amount === 0;
  const estimatedSurplus = eligible ? Math.max(0, (pool ?? 0) - dueReserve - estimatedBillReserve - goalReserve - buffer) : null;

  // Nhóm 5: OPTIMIZATION - Tiền nhàn rỗi sinh lời
  if (estimatedSurplus !== null && estimatedSurplus >= 5_000_000) {
    candidates.push({
      id: "investment:discovery",
      topic: "investment",
      category: "OPTIMIZATION",
      categoryLabel: "Cơ hội tối ưu",
      slotGroup: "GROW_AND_GUIDE",
      tone: "info",
      priority: 3,
      severity: "info",
      confidence: "estimated",
      title: "Có thể tìm hiểu phương án sinh lời",
      body: "Sau các khoản giữ lại theo giả định hiện tại, bạn có thể trao đổi thêm về thời hạn và mức rủi ro phù hợp.",
      impactLine: `Ước tính khoảng ${formatVndVietnamese(estimatedSurplus)} nhàn rỗi sau khi giữ đủ quỹ dự phòng.`,
      badgeText: "Tiền nhàn rỗi",
      actionType: "chat_handoff",
      primaryAction: {
        type: "chat_handoff",
        label: "Tối ưu sinh lời cùng M-Your",
      },
      metric: { label: "Phần dư ước tính để trao đổi thêm", value: estimatedSurplus, unit: "VND" },
      facts: { estimated_surplus: estimatedSurplus, buffer, due_reserve: dueReserve, goal_reserve: goalReserve },
      action: "chat",
      question: "Tôi muốn tìm hiểu phương án sinh lời cho phần tiền dư ước tính. Hãy hỏi thời gian cần dùng tiền, quỹ dự phòng và mức chấp nhận rủi ro trước khi gợi ý. Không coi đây là số tiền chắc chắn đầu tư được.",
    });
  }

  // Nhóm 5: OPTIMIZATION - Tiền chưa phân bổ vào hũ
  if (pool !== null && pool >= 100_000) {
    candidates.push({
      id: "allocation:pool",
      topic: "allocation",
      category: "OPTIMIZATION",
      categoryLabel: "Cơ hội tối ưu",
      slotGroup: "GROW_AND_GUIDE",
      tone: "info",
      priority: 4,
      severity: "info",
      confidence: "recorded",
      title: "Bạn có tiền chưa phân bổ vào hũ",
      body: "Cùng M-Your chọn số tiền muốn chia và ưu tiên các hũ. Phần này có thể còn cần cho các khoản sắp trả.",
      impactLine: `Có ${formatVndVietnamese(pool)} trong tài khoản chưa được phân bổ vào các hũ.`,
      badgeText: "Chưa phân bổ",
      actionType: "open_auto_fund",
      primaryAction: {
        type: "open_auto_fund",
        label: "Chia tiền vào hũ",
      },
      metric: { label: "Chưa phân bổ", value: pool, unit: "VND" },
      facts: { unallocated: pool, known_due_reserve: dueReserve },
      action: "chat",
      question: "Tôi muốn chia tiền chưa phân bổ vào các hũ. Trước tiên hãy hỏi tôi muốn chia bao nhiêu và ưu tiên hũ nào, rồi đề xuất phương án để tôi xác nhận.",
    });
  }

  // Nhóm 6: PERIODIC_PULSE - Nhịp tiền định kỳ tuần
  const last7Spend = Array.from(last7.values()).reduce((sum, v) => sum + v, 0);
  const upcomingBillsCount = dueSoon.length + predictedSoon.length;
  const benchmark = Math.max(1_000_000, round((fin.prevCashflow.expense || fin.cashflow.expense || 12_000_000) / 4));
  const isLower = last7Spend <= benchmark;
  const pctDiff = benchmark > 0 ? Math.abs(round(((last7Spend - benchmark) / benchmark) * 100)) : 0;
  const weeklyImpact = isLower
    ? `7 ngày qua chi ${formatVndVietnamese(last7Spend)}, thấp hơn nhịp ${pctDiff}%. Tuần tới có ${upcomingBillsCount} hóa đơn.`
    : `7 ngày qua chi ${formatVndVietnamese(last7Spend)}, cao hơn nhịp ${pctDiff}%. Tuần tới có ${upcomingBillsCount} hóa đơn.`;

  candidates.push({
    id: "pulse:weekly_brief",
    topic: "spending",
    category: "PERIODIC_PULSE",
    categoryLabel: "Nhịp tiền định kỳ",
    slotGroup: "GROW_AND_GUIDE",
    tone: "info",
    priority: 3,
    severity: "info",
    confidence: "recorded",
    title: "Nhịp chi tiêu 7 ngày qua",
    body: `7 ngày qua chi ${formatVndVietnamese(last7Spend)}, ${isLower ? "thấp" : "cao"} hơn nhịp ${pctDiff}%. Tuần tới có ${upcomingBillsCount} hóa đơn.`,
    impactLine: weeklyImpact,
    badgeText: "7 ngày qua",
    actionType: "navigate_pfm",
    actionHref: "/pfm",
    primaryAction: {
      type: "navigate_pfm",
      label: "Xem báo cáo tuần",
      href: "/pfm",
    },
    metric: { label: "Chi tiêu 7 ngày qua", value: round(last7Spend), unit: "VND" },
    facts: {
      rule_id: "weekly_pulse",
      last_7_days_spend: round(last7Spend),
      weekly_benchmark: benchmark,
      upcoming_bills_count: upcomingBillsCount,
    },
    action: "overview",
    question: "Tóm tắt nhịp chi tiêu 7 ngày qua của tôi và các khoản cần lưu ý trong tuần tới.",
  });

  // Nhóm 7: RECOGNITION_RECAP - Ghi nhận kỷ luật chi tiêu & hũ
  const overLimitJars = jars.filter((j) => typeof j.limit === "number" && j.limit > 0 && j.spent > j.limit);
  if (jars.length > 0 && overLimitJars.length === 0 && fin.cashflow.expense > 0) {
    candidates.push({
      id: "recap:budget_discipline",
      topic: "spending",
      category: "RECOGNITION_RECAP",
      categoryLabel: "Ghi nhận & nhìn lại",
      slotGroup: "GROW_AND_GUIDE",
      tone: "positive",
      priority: 4,
      severity: "info",
      confidence: "recorded",
      title: "Duy trì kỷ luật ngân sách tốt",
      body: "Tất cả các hũ chi tiêu trong tháng đều đang nằm trong hạn mức kế hoạch.",
      impactLine: "Tất cả các hũ đang đúng kế hoạch, kỷ luật chi tiêu rất tốt.",
      badgeText: "Đúng kế hoạch",
      actionType: "navigate_wrapped",
      actionHref: "/wrapped",
      primaryAction: {
        type: "navigate_wrapped",
        label: "Xem hành trình nhìn lại",
        href: "/wrapped",
      },
      metric: { label: "Số hũ trong hạn mức", value: jars.length, unit: "VND" },
      facts: { total_jars: jars.length, over_limit_count: 0 },
      action: "overview",
      question: "Tổng kết kỷ luật chi tiêu tháng này của tôi: đã tiết kiệm được bao nhiêu và duy trì hạn mức các hũ ra sao?",
    });
  }

  // Ma trận Detectors Bảo mật (Security / Fraud)
  if (securitySummary) {
    // 1. SC3 / Hold (Mức ĐỎ)
    if (securitySummary.hasActiveCase || securitySummary.hasActiveHold || securitySummary.hasPendingOff) {
      candidates.push({
        id: "security:sc3_active_case",
        topic: "spending",
        domain: "SECURITY",
        securityLevel: "RED",
        scenarioCode: "SC3",
        category: "SECURITY_RED",
        categoryLabel: "Bảo mật · Đỏ",
        slotGroup: "PROTECT",
        tone: "urgent",
        priority: 0,
        severity: "urgent",
        confidence: "recorded",
        title: "Hồ sơ của bạn đang được xử lý.",
        body: "Lưu ý: bất kỳ ai đề nghị 'hỗ trợ lấy lại tiền' có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app này.",
        impactLine: "Lưu ý: bất kỳ ai đề nghị 'hỗ trợ lấy lại tiền' có thu phí đều là lừa đảo. MSB chỉ cập nhật hồ sơ trong app này.",
        badgeText: "Bảo mật · Đỏ",
        actionType: "view_fraud_case",
        actionHref: "/settings",
        actionLabel: "Xem trạng thái hồ sơ",
        primaryAction: {
          type: "view_fraud_case",
          label: "Xem trạng thái hồ sơ",
          href: "/settings",
        },
        chips: [
          { label: "Xem trạng thái hồ sơ", actionType: "view_fraud_case", href: "/settings", variant: "primary" },
        ],
        metric: { label: "Trạng thái bảo mật", value: 1, unit: "count" },
        facts: { has_active_case: Boolean(securitySummary.hasActiveCase), has_active_hold: Boolean(securitySummary.hasActiveHold) },
        action: "overview",
        question: "Trạng thái xử lý hồ sơ tra soát của tôi hiện tại như thế nào?",
      });
    }

    // 2. BT5 / T7b - Nhận tiền lớn từ TK lạ (Mức ĐỎ)
    if (securitySummary.largeUnknownInflow && securitySummary.largeUnknownInflow.amount >= 10_000_000) {
      const amt = securitySummary.largeUnknownInflow.amount;
      candidates.push({
        id: "security:bt5_large_unknown_inflow",
        topic: "spending",
        domain: "SECURITY",
        securityLevel: "RED",
        scenarioCode: "BT5",
        category: "SECURITY_RED",
        categoryLabel: "Cảnh báo",
        slotGroup: "PROTECT",
        tone: "urgent",
        priority: 0.5,
        severity: "urgent",
        confidence: "recorded",
        title: `Bạn vừa nhận ${formatVndVietnamese(amt)} từ tài khoản lạ.`,
        body: "Nếu có người báo chuyển nhầm và nhờ chuyển trả vào tài khoản khác, đừng làm. MSB sẽ tra soát và hoàn trả về đúng tài khoản gốc.",
        impactLine: "Nếu có người báo chuyển nhầm và nhờ chuyển trả vào tài khoản khác, đừng làm. MSB sẽ tra soát và hoàn trả về đúng tài khoản gốc.",
        badgeText: "Cảnh báo",
        actionType: "request_msb_investigation",
        actionLabel: "Yêu cầu MSB tra soát",
        primaryAction: {
          type: "request_msb_investigation",
          label: "Yêu cầu MSB tra soát",
        },
        chips: [
          { label: "Yêu cầu MSB tra soát", actionType: "request_msb_investigation", prompt: "Tôi vừa nhận khoản tiền lạ và muốn yêu cầu MSB tra soát hoàn trả về tài khoản gốc.", variant: "primary" },
          { label: "Tôi biết khoản này", actionType: "mark_known_sender", variant: "secondary" },
        ],
        metric: { label: "Khoản tiền lạ", value: amt, unit: "VND" },
        facts: { amount: amt, sender: securitySummary.largeUnknownInflow.senderName ?? "unknown" },
        action: "chat",
        question: "Tôi vừa nhận khoản tiền lạ từ tài khoản khác, MSB hướng dẫn tôi cách xử lý an toàn?",
      });
    }

    // 3. BT4 / T7a - Nhận mồi khoản nhỏ liên tiếp (Mức VÀNG)
    if (securitySummary.baitInflow && securitySummary.baitInflow.count >= 3) {
      const bait = securitySummary.baitInflow;
      candidates.push({
        id: "security:bt4_bait_inflow",
        topic: "spending",
        domain: "SECURITY",
        securityLevel: "AMBER",
        scenarioCode: "BT4",
        category: "SECURITY_AMBER",
        categoryLabel: "Cảnh báo Vàng",
        slotGroup: "PROTECT",
        tone: "warning",
        priority: 1,
        severity: "attention",
        confidence: "recorded",
        title: `Bạn vừa nhận ${formatVndVietnamese(bait.lastAmount)} từ tài khoản lạ.`,
        body: "Nếu đây là 'hoa hồng làm nhiệm vụ', đó thường là bước mồi của lừa đảo.",
        impactLine: "Nếu đây là 'hoa hồng làm nhiệm vụ', đó thường là bước mồi của lừa đảo.",
        badgeText: "Cảnh báo Vàng",
        actionType: "open_security_handbook",
        actionLabel: "Xem thủ đoạn",
        primaryAction: {
          type: "open_security_handbook",
          label: "Xem thủ đoạn",
        },
        chips: [
          { label: "Xem thủ đoạn", actionType: "open_security_handbook", variant: "primary" },
          { label: "Tôi biết người này", actionType: "mark_known_sender", variant: "secondary" },
        ],
        metric: { label: "Khoản nhận mồi gần nhất", value: bait.lastAmount, unit: "VND" },
        facts: { count: bait.count, last_amount: bait.lastAmount, sender: bait.senderName ?? "unknown" },
        action: "overview",
        question: "Dấu hiệu bẫy hoa hồng làm nhiệm vụ lừa đảo qua tài khoản ngân hàng là gì?",
      });
    }

    // 4. BT3 - Số dư tăng mạnh chưa có người thân khẩn cấp (Mức XANH)
    if (!securitySummary.hasEmergencyContact && (Boolean(securitySummary.highBalanceInflow) || casaBalance >= 50_000_000)) {
      const balanceAmount = securitySummary.highBalanceInflow?.amount ?? casaBalance;
      candidates.push({
        id: "security:bt3_high_balance",
        topic: "spending",
        domain: "SECURITY",
        securityLevel: "GREEN",
        scenarioCode: "BT3",
        category: "SECURITY_GREEN",
        categoryLabel: "Bảo mật",
        slotGroup: "GROW_AND_GUIDE",
        tone: "security",
        priority: 8,
        severity: "info",
        confidence: "recorded",
        title: `Khoản ${formatVndVietnamese(balanceAmount)} vừa về. Thêm người thân khẩn cấp để bảo vệ tài khoản.`,
        body: "Luôn có người cùng bạn kiểm tra khi có giao dịch bất thường.",
        impactLine: "Luôn có người cùng bạn kiểm tra khi có giao dịch bất thường.",
        badgeText: "Bảo mật",
        actionType: "open_emergency_contact",
        actionHref: "/settings",
        actionLabel: "Thêm người thân",
        primaryAction: {
          type: "open_emergency_contact",
          label: "Thêm người thân",
          href: "/settings",
        },
        chips: [
          { label: "Thêm người thân", actionType: "open_emergency_contact", href: "/settings", variant: "primary" },
          { label: "Tự khóa chuyển tiền", actionType: "navigate_security_hub", href: "/settings", variant: "secondary" },
          { label: "Để sau", actionType: "dismiss", variant: "ghost" },
        ],
        metric: { label: "Số dư khả dụng", value: balanceAmount, unit: "VND" },
        facts: { liquid_balance: balanceAmount },
        action: "overview",
        question: "Làm thế nào để thêm Người liên hệ khẩn cấp bảo vệ số dư tài khoản của tôi?",
      });
    }

    // 5. BT1 / BT2 - Làm quen bảo mật / Điểm bảo mật thấp (Mức XANH)
    if (securitySummary.isNewUserOnboarding || (typeof securitySummary.score === "number" && securitySummary.score < 80)) {
      const scoreVal = securitySummary.score ?? 70;
      candidates.push({
        id: "security:bt1_onboarding",
        topic: "spending",
        domain: "SECURITY",
        securityLevel: "GREEN",
        scenarioCode: "BT1",
        category: "SECURITY_GREEN",
        categoryLabel: "Bảo mật",
        slotGroup: "GROW_AND_GUIDE",
        tone: "security",
        priority: 9,
        severity: "info",
        confidence: "recorded",
        title: "Bạn đã biết những phương thức bảo mật của MSB chưa?",
        body: `Điểm bảo mật: ${scoreVal}/100. Bật mã chống giả mạo (+15) và thêm người thân khẩn cấp (+10) để lên mức Cao.`,
        impactLine: `Điểm bảo mật: ${scoreVal}/100. Bật mã chống giả mạo (+15) và thêm người thân khẩn cấp (+10) để lên mức Cao.`,
        badgeText: "Bảo mật",
        actionType: "open_security_handbook",
        actionLabel: "Xem cẩm nang bảo mật",
        primaryAction: {
          type: "open_security_handbook",
          label: "Xem cẩm nang bảo mật",
        },
        chips: [
          { label: "Xem cẩm nang bảo mật", actionType: "open_security_handbook", variant: "primary" },
          { label: "Trung tâm bảo mật", actionType: "navigate_security_hub", href: "/settings/security", variant: "secondary" },
        ],
        metric: { label: "Điểm bảo mật", value: scoreVal, unit: "points" },
        facts: { score: scoreVal },
        action: "overview",
        question: "Những phương thức bảo vệ tài khoản khuyến nghị của MSB gồm những gì?",
      });
    }
  }

  // Nhóm 8: DISCOVERY_GUIDE - Tính năng tự động phân bổ hũ khi lương về
  if (pool !== null && pool >= 100_000) {
    candidates.push({
      id: "guide:auto_fund",
      topic: "allocation",
      category: "DISCOVERY_GUIDE",
      categoryLabel: "Khám phá & Bảo mật",
      slotGroup: "GROW_AND_GUIDE",
      tone: "info",
      priority: 4,
      severity: "info",
      confidence: "recorded",
      title: "Tự động phân bổ khi lương về",
      body: "Bạn hay chia tiền thủ công đầu tháng. Muốn M-Your tự động phân bổ ngay khi lương về không?",
      impactLine: "Tự động chia tiền vào các hũ mỗi khi lương về, không lo quên.",
      badgeText: "Tính năng mới",
      actionType: "open_auto_fund",
      primaryAction: {
        type: "open_auto_fund",
        label: "Thiết lập tự động",
      },
      metric: { label: "Tiền chưa phân bổ", value: pool, unit: "VND" },
      facts: { unallocated_amount: pool },
      action: "chat",
      question: "Làm thế nào để thiết lập quy tắc tự động chia tiền vào các hũ khi tài khoản nhận lương?",
    });
  }

  const orderedCandidates = selectOrderedHomeCandidates(candidates);
  const history = Array.from({ length: 6 }, (_, i) => {
    const key = addMonthsToKey(month, -i);
    return { month: key, ...cash(monthPeriodFromKey(key)) };
  });
  const daily = Array.from({ length: 30 }, (_, i) => {
    const from = dayStart - i * DAY;
    const value = cash({ from: new Date(from).toISOString(), to: new Date(from + DAY - 1).toISOString(), label: "day" });
    return { date: vnDate(new Date(from).toISOString()), income: value.income, expense: value.expense };
  });
  const sorted = txns.slice().sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.id.localeCompare(b.id));

  const healthScore = composeFinancialHealthScore({
    financials: fin,
    accounts: raw.accounts,
    liabilities,
    transactions: txns,
    fixedCategoryIds: fixed,
    month,
    profileComplete: overlay.complete,
    now,
    asOf: today,
  });

  return {
    schemaVersion: "2.0", asOf: today, timezone: "Asia/Ho_Chi_Minh", currency: "VND", period: month,
    dataQuality: { mode: "demo", profileComplete: overlay.complete, transactionCount: txns.length,
      transactionRowsIncluded: Math.min(500, txns.length), transactionRowsTruncated: txns.length > 500,
      aggregatesUseAllRows: true, sessionTopups: sessionTopups.length,
      missing: [!overlay.complete && "self_reported_profile", "full_card_statement_balance", "confirmed_bill_feed", "investment_risk_profile"].filter(Boolean) },
    accounts: raw.accounts.map((a) => ({ id: a.id, type: a.type, currency: a.currency,
      balance: a.balance, availableBalance: a.availableBalance, source: a.source, lastSyncedAt: a.lastSyncedAt })),
    assets, liabilities, goals, categories, budgets: raw.budgets, spendingByCategory: fin.categorySpend,
    cashflow: { today: todayCash, monthToDate: fin.cashflow, previousComparable: priorComparable, monthly: history, daily },
    jars, unallocated: fin.unallocatedPool, payments, predictedBills: bills, recurring: fin.recurring,
    networth: fin.networth, health: fin.health, healthScore, endOfMonth: fin.endOfMonth, runway: fin.runway, unlabeled: fin.unlabeled,
    opportunity: { estimatedSurplus, buffer, dueReserve, estimatedBillReserve, goalReserve, eligible },
    historicalNetworth: raw.snapshots,
    transactions: sorted.slice(0, 500).map((t) => ({ id: t.id, postedAt: t.postedAt, amount: t.amount, currency: t.currency,
      direction: t.direction, type: t.type, categoryId: t.categoryId, merchant: t.merchantName.slice(0, 100),
      status: t.status, source: t.source, recurring: t.isRecurring, rebalance: t.rebalance })),
    candidates: orderedCandidates,
  };
}
export type CustomerFinancialSnapshot = ReturnType<typeof buildCustomerSnapshot>;
