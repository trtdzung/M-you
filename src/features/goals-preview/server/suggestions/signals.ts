import "server-only";

/**
 * Tín hiệu gợi ý của Mục tiêu: chạy lại đúng các luật viết sẵn của agent-sim
 * (`firedSuggestions`), gắn số liệu (`facts`) để agent viết lại lời, chặn an toàn
 * và xếp hạng. Thuần, không đọc/ghi DB; phần "đã bỏ qua / đã chúc mừng" do
 * service truyền vào qua `SignalHistory`.
 */

import { firedSuggestions, SUGGESTION_RULES } from "../../agent-sim/rules";
import { formatVnd } from "../../format-money";
import { daysBetween, formatISODate, monthsLeft } from "../../engine/dates";
import { goalOptions, isSaving, requiredMonthly } from "../../engine/feasibility";
import { idleCash, investSuggestions } from "../../engine/invest";
import { goalAssets, goalLoan, goalValue, progressPct, progressState, remainingAmount } from "../../engine/value";
import type { AgentSuggestion, PreviewState, SuggestionAction, SuggestionKind, WorldState } from "../../model/state";
import type { Goal, LiquidAsset } from "../../model/types";

export type SignalFacts = Record<string, number | string>;

export interface SignalFallback {
  title: string;
  body: string;
  tone: NonNullable<AgentSuggestion["tone"]>;
}

export interface SuggestionSignal {
  /** `${ruleKey}:${goalId | "all"}` như agent-sim; mốc tiến độ: `milestone:${goalId}:${pct}`. */
  id: string;
  /** null = tín hiệu toàn khách (D7). */
  goalId: string | null;
  /** Khoá luật (`overdue`, `achieved`, `milestone`…). */
  kind: string;
  /** Vị trí 1-based trong danh sách đã xếp. */
  rank: number;
  facts: SignalFacts;
  allowedActions: SuggestionAction[];
  fallback: SignalFallback;
}

/** Những gì đã lưu về tín hiệu (do store đọc), để chặn lặp / hạ hạng. */
export interface SignalHistory {
  /** Ẩn: `dismissed_until` còn hiệu lực. */
  hiddenIds: ReadonlySet<string>;
  /** `ignored_count ≥ 3` → xuống cuối danh sách. */
  demotedIds: ReadonlySet<string>;
  /** Mốc tiến độ khách đã thấy và đã bấm/để sau → không chúc mừng lại. */
  celebratedIds: ReadonlySet<string>;
}

export const MAX_SIGNALS = 3;
export const MAX_DTI_PCT = 40;
const MILESTONES = [25, 50, 75] as const;

/** Thứ tự ưu tiên (TASKS T7.2 + D16); số nhỏ = gấp hơn. Khoá không có trong danh sách xếp cuối. */
const TIER: Record<string, number> = {
  overdue: 0,
  standing_order_failed: 1,
  due_soon: 2,
  missed: 2,
  behind_plan: 3,
  priority_conflict: 4,
  idle_cash: 5,
  salary: 5,
  prepay: 5,
  loan_blocked: 6,
  insufficient_data: 6,
  revalue_asset: 6,
  maturity: 6,
  fund_drop: 6,
  early_achieved: 7,
  achieved: 7,
  completed_next: 7,
  milestone: 7,
};
const LAST_TIER = 7;

/** Loại thẻ (`AgentSuggestion.kind`) của một khoá luật. */
export function cardKindOf(signalKind: string): SuggestionKind {
  return SUGGESTION_RULES.find((r) => r.key === signalKind)?.kind ?? "generic";
}

// ------------------------------------------------------------------ number keys (cùng cách với guard.py của agent)

const NUMBER_RE = /(?<![\d.,])(\d+(?:[.,]\d+)*)(?:\s*(triệu|tỷ|tỉ)(?![\p{L}\d_]))?/giu;

function digitsOf(value: number): string {
  const text = String(Math.abs(value));
  const plain = /e/i.test(text) ? Math.abs(value).toFixed(0) : text;
  return plain.replace(".", "").replace(/^0+/, "") || "0";
}

/** Khoá so sánh của mọi con số viết trong `text` (bỏ dấu chấm/phẩy, hiểu "triệu"/"tỷ"). */
export function numberKeys(text: string): string[] {
  const keys: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[1];
    const unit = m[2]?.toLowerCase();
    if (unit) {
      const groups = raw.split(/[.,]/);
      const n = groups.length > 1 && groups[groups.length - 1].length !== 3
        ? Number(`${groups.slice(0, -1).join("")}.${groups[groups.length - 1]}`)
        : Number(groups.join(""));
      if (Number.isFinite(n)) {
        keys.push(digitsOf(Math.round(n * (unit === "triệu" ? 1e6 : 1e9))));
        continue;
      }
    }
    keys.push(raw.replace(/[.,]/g, "").replace(/^0+/, "") || "0");
  }
  return keys;
}

/** Khoá của mọi con số có trong `facts` (số và số nằm trong chuỗi). */
export function factKeys(facts: SignalFacts): Set<string> {
  const keys = new Set<string>();
  for (const value of Object.values(facts)) {
    if (typeof value === "number") keys.add(digitsOf(value));
    else for (const k of numberKeys(value)) keys.add(k);
  }
  return keys;
}

// ------------------------------------------------------------------ facts

const round1 = (n: number) => Math.round(n * 10) / 10;

function customerFacts(s: PreviewState): SignalFacts {
  const facts: SignalFacts = {
    today: formatISODate(s.clock.today),
    salary_day: s.customer.salaryDay,
    main_casa_balance: s.customer.mainCasaBalance,
  };
  if (s.customer.monthlySurplus !== "unknown") facts.monthly_surplus = s.customer.monthlySurplus;
  return facts;
}

function goalFacts(s: PreviewState, goal: Goal): SignalFacts {
  const facts: SignalFacts = {
    goal_name: goal.name,
    target_amount: goal.targetAmount,
    target_date: formatISODate(goal.targetDate),
    goal_value: goalValue(s, goal).total,
    progress_pct: round1(progressPct(s, goal)),
    remaining_amount: remainingAmount(s, goal),
    months_left: monthsLeft(s.clock.today, goal.targetDate),
    required_monthly: requiredMonthly(s, goal),
  };
  if (goal.standingOrder) {
    facts.standing_order_amount = goal.standingOrder.amount;
    facts.standing_order_day = goal.standingOrder.dayOfMonth;
  }
  const idle = idleCash(s, goal);
  if (idle > 0) facts.idle_cash = idle;
  const loan = goalLoan(s, goal);
  const next = loan?.status === "active" ? loan.schedule.find((r) => r.status !== "paid") : undefined;
  if (next) {
    facts.next_payment_amount = next.payment;
    facts.next_payment_date = formatISODate(next.dueDate);
  }
  return facts;
}

const fundDropPct = (a: LiquidAsset) => (a.costBasis > 0 ? ((a.costBasis - a.value) / a.costBasis) * 100 : 0);

/** Số riêng của từng luật (đặt tên rõ cho agent). Các số khác trong lời viết sẵn được bắt thêm ở `withTextNumbers`. */
function ruleFacts(s: PreviewState, kind: string, goal: Goal | undefined): SignalFacts {
  const today = s.clock.today;
  const facts: SignalFacts = {};
  if (!goal) {
    if (kind === "priority_conflict") {
      const saving = s.goals.filter(isSaving);
      facts.saving_goal_count = saving.length;
      facts.total_required_monthly = saving.reduce((sum, g) => sum + requiredMonthly(s, g), 0);
    }
    if (kind === "insufficient_data") facts.data_months = s.customer.dataMonths;
    return facts;
  }
  switch (kind) {
    case "overdue": {
      const loan = s.loans.find((l) => l.goalId === goal.id && l.status === "active");
      const rows = loan?.schedule.filter((r) => r.status === "overdue") ?? [];
      facts.overdue_count = rows.length;
      facts.overdue_total = rows.reduce((sum, r) => sum + r.payment, 0);
      break;
    }
    case "due_soon":
      facts.days_left = Math.max(0, daysBetween(today, goal.targetDate));
      break;
    case "maturity": {
      const deposits = goalAssets(s, goal.id).filter(
        (a): a is LiquidAsset => a.type === "liquid" && a.category === "term_deposit" && !!a.maturityDate,
      );
      const hit = deposits.find((a) => a.status === "matured") ?? deposits.find((a) => a.status === "held" && daysBetween(today, a.maturityDate!) <= 14);
      if (hit) {
        facts.asset_name = hit.name;
        facts.asset_value = hit.value;
        facts.maturity_date = formatISODate(hit.maturityDate);
        facts.days_to_maturity = Math.max(0, daysBetween(today, hit.maturityDate!));
      }
      break;
    }
    case "fund_drop": {
      const hit = goalAssets(s, goal.id).find(
        (a): a is LiquidAsset => a.type === "liquid" && a.category === "fund" && a.status === "held" && fundDropPct(a) >= 5,
      );
      if (hit) {
        facts.fund_name = hit.name;
        facts.fund_drop_pct = Math.max(0, Math.round(fundDropPct(hit)));
      }
      break;
    }
    case "loan_blocked": {
      const loan = goalOptions(s, goal).loan;
      if (loan) {
        facts.loan_monthly_payment = loan.monthlyPayment;
        facts.dti_pct = round1(loan.affordability.dti * 100);
      }
      facts.dti_limit_pct = MAX_DTI_PCT;
      break;
    }
    case "idle_cash": {
      const best = investSuggestions(s, goal, idleCash(s, goal))[0];
      if (best) {
        facts.product_name = best.title;
        if (best.ratePa) facts.product_rate_pa = best.ratePa;
        if (best.estimatedAtMaturity) facts.product_estimated_at_maturity = best.estimatedAtMaturity;
        if (best.maturityDate) facts.product_maturity_date = formatISODate(best.maturityDate);
      }
      break;
    }
    case "revalue_asset": {
      const hit = goalAssets(s, goal.id).find((a) => a.type === "fixed" && a.status === "held" && daysBetween(a.valuationDate, today) > 180);
      if (hit) {
        facts.asset_name = hit.name;
        facts.asset_value = hit.value;
        facts.months_since_valuation = Math.max(1, Math.floor(daysBetween(hit.valuationDate, today) / 30));
      }
      break;
    }
  }
  return facts;
}

/** Mọi con số trong lời viết sẵn phải có trong facts: số nào chưa có thì thêm `text_number_<n>`. */
function withTextNumbers(facts: SignalFacts, fallback: SignalFallback, actions: SuggestionAction[]): SignalFacts {
  const known = factKeys(facts);
  const out = { ...facts };
  let n = 0;
  const texts = [fallback.title, fallback.body, ...actions.map((a) => a.label)];
  for (const text of texts) {
    for (const m of text.matchAll(NUMBER_RE)) {
      const key = numberKeys(m[0])[0];
      if (key === undefined || known.has(key)) continue;
      known.add(key);
      out[`text_number_${++n}`] = m[0];
    }
  }
  return out;
}

// ------------------------------------------------------------------ safety

const LOAN_SCREENS = new Set(["LoanSimulator"]);

/** DTI (%) nếu vay phần thiếu của mục tiêu; không có khoản vay gợi ý → DTI hiện tại của khách. */
function loanDtiPct(s: PreviewState, goal: Goal): number {
  const loan = goalOptions(s, goal).loan;
  if (loan) return loan.affordability.dti * 100;
  const income = s.customer.monthlyIncome;
  return income > 0 ? (s.customer.existingDebtPayment / income) * 100 : Infinity;
}

/**
 * Chặn an toàn (T7.3). Trả null nếu bỏ hẳn tín hiệu.
 * - Gợi ý sản phẩm có kỳ hạn đáo hạn sau ngày mục tiêu → bỏ tín hiệu tiền nhàn rỗi.
 * - DTI > 40% → bỏ nút vay; lời viết sẵn bỏ ý "vay phần thiếu".
 */
function applySafety(s: PreviewState, kind: string, goal: Goal | undefined, card: AgentSuggestion): AgentSuggestion | null {
  if (!goal) return card;
  if (kind === "idle_cash") {
    const best = investSuggestions(s, goal, idleCash(s, goal))[0];
    if (best?.maturityDate && best.maturityDate > goal.targetDate) return null;
    return card;
  }
  if (kind !== "due_soon" && kind !== "missed") return card;
  if (loanDtiPct(s, goal) <= MAX_DTI_PCT) return card;
  const actions = card.actions.filter((a) => !(a.nav && LOAN_SCREENS.has(a.nav.screen)));
  if (actions.length > 0 && !actions.some((a) => a.primary)) actions[0] = { ...actions[0], primary: true };
  const gap = formatVnd(remainingAmount(s, goal));
  const body =
    kind === "due_soon"
      ? `“${goal.name}” còn thiếu ${gap}. Bạn có thể gia hạn thêm thời gian hoặc giảm số tiền mục tiêu, không cần chờ đến sát ngày.`
      : `“${goal.name}” còn thiếu ${gap}. Bạn có thể lùi ngày hoặc giảm số tiền mục tiêu. Mình đã chuẩn bị sẵn các phương án.`;
  return { ...card, body, actions };
}

// ------------------------------------------------------------------ milestone (vượt mốc 25/50/75% lần đầu)

function milestoneCard(s: PreviewState, goal: Goal, celebrated: ReadonlySet<string>): { kind: string; card: AgentSuggestion } | null {
  if (goal.status !== "accumulating") return null;
  const state = progressState(s, goal);
  if (state !== "on_track" && state !== "ahead") return null;
  const pct = progressPct(s, goal);
  if (pct >= 100) return null;
  const reached = [...MILESTONES].reverse().find((m) => pct >= m);
  if (!reached) return null;
  // Đã chúc mừng mốc này hoặc mốc cao hơn → không lặp lại.
  if (MILESTONES.some((m) => m >= reached && celebrated.has(`milestone:${goal.id}:${m}`))) return null;
  const id = `milestone:${goal.id}:${reached}`;
  const value = goalValue(s, goal).total;
  return {
    kind: "milestone",
    card: {
      id,
      kind: "generic",
      goalId: goal.id,
      title: `Bạn đã đi được ${reached}% chặng đường`,
      body: `“${goal.name}” đã có ${formatVnd(value)} / ${formatVnd(goal.targetAmount)}, đúng kế hoạch. Giữ nhịp này là kịp ${formatISODate(goal.targetDate)}.`,
      tone: "success",
      actions: [
        { label: "Xem tiến độ", nav: { screen: "GoalDetail", params: { goalId: goal.id } }, primary: true },
        { label: "Để sau", action: { type: "dismissSuggestion", id }, primary: false },
      ],
    },
  };
}

// ------------------------------------------------------------------ build + rank

interface Candidate {
  kind: string;
  goal: Goal | undefined;
  card: AgentSuggestion;
  urgency: number;
}

export function toPreviewState(world: WorldState): PreviewState {
  return { ...world, dismissedSuggestionIds: [], nav: { stack: [] }, toasts: [] };
}

function toSignal(s: PreviewState, c: Candidate, rank: number): SuggestionSignal {
  const fallback: SignalFallback = { title: c.card.title, body: c.card.body, tone: c.card.tone ?? "info" };
  const base: SignalFacts = {
    ...customerFacts(s),
    ...(c.goal ? goalFacts(s, c.goal) : {}),
    ...ruleFacts(s, c.kind, c.goal),
  };
  if (c.kind === "milestone") base.milestone_pct = Number(c.card.id.split(":")[2]);
  return {
    id: c.card.id,
    goalId: c.goal?.id ?? null,
    kind: c.kind,
    rank,
    facts: withTextNumbers(base, fallback, c.card.actions),
    allowedActions: c.card.actions,
    fallback,
  };
}

/**
 * Tín hiệu đang hiển thị được, đã xếp hạng: theo bậc ưu tiên rồi độ gấp của luật;
 * tín hiệu bị bỏ qua ≥ 3 lần xuống cuối; ẩn tín hiệu đang "để sau";
 * tối đa 1 tín hiệu / mục tiêu và `MAX_SIGNALS` toàn danh sách.
 */
export function buildSignals(world: WorldState, history: SignalHistory): SuggestionSignal[] {
  const s = toPreviewState(world);
  const goalsById = new Map(s.goals.map((g) => [g.id, g]));
  const candidates: Candidate[] = [];

  for (const { rule, suggestion } of firedSuggestions(s)) {
    const goal = suggestion.goalId ? goalsById.get(suggestion.goalId) : undefined;
    const card = applySafety(s, rule.key, goal, suggestion);
    if (card) candidates.push({ kind: rule.key, goal, card, urgency: rule.urgency });
  }
  for (const goal of s.goals) {
    const hit = milestoneCard(s, goal, history.celebratedIds);
    if (hit) candidates.push({ kind: hit.kind, goal, card: hit.card, urgency: 0 });
  }

  const tierOf = (c: Candidate) => (history.demotedIds.has(c.card.id) ? LAST_TIER + 1 : (TIER[c.kind] ?? LAST_TIER));
  const priorityOf = (c: Candidate) => c.goal?.priority ?? 0;
  const ranked = candidates
    .filter((c) => !history.hiddenIds.has(c.card.id))
    .sort((a, b) => tierOf(a) - tierOf(b) || b.urgency - a.urgency || priorityOf(a) - priorityOf(b));

  const picked: Candidate[] = [];
  const usedGoals = new Set<string>();
  for (const c of ranked) {
    if (picked.length >= MAX_SIGNALS) break;
    if (c.goal) {
      if (usedGoals.has(c.goal.id)) continue;
      usedGoals.add(c.goal.id);
    }
    picked.push(c);
  }
  return picked.map((c, i) => toSignal(s, c, i + 1));
}
