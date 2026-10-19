"use client";

import type { ReactNode } from "react";
import { Car, GraduationCap, Heart, House, LifeBuoy, Plane, Target, TreePalm, type LucideIcon } from "lucide-react";
import { addMonths, dayOfMonth, formatISODate } from "../../../engine/dates";
import { allocateSurplus, feasibility, goalOptions, type Feasibility, type GoalOptions } from "../../../engine/feasibility";
import { goalValue } from "../../../engine/value";
import type { PreviewState } from "../../../model/state";
import type { ScreenParams } from "../../../model/screens";
import { paramNumber, paramString } from "../../../model/screens";
import type { Goal, GoalAccount, GoalFlexibility, GoalTemplate } from "../../../model/types";
import { useNav, usePreview } from "../../../store/PreviewStore";
import { EmptyState } from "../../shared/EmptyState";
import { ScreenHeader } from "../../shared/ScreenHeader";

export const WIZARD_STEPS = ["Chọn mục tiêu", "Thông tin", "Vốn ban đầu", "Kiểm tra", "Mở tài khoản"];

export interface TemplateConfig {
  id: GoalTemplate;
  title: string;
  icon: LucideIcon;
  defaultName: string;
  /** Suggested target amount; emergency is derived from expenses. */
  amount: number;
  months: number;
  flexibility: GoalFlexibility;
  hint: string;
}

const TR = 1_000_000;

export const TEMPLATES: TemplateConfig[] = [
  { id: "house", title: "Mua nhà", icon: House, defaultName: "Mua nhà", amount: 1_500 * TR, months: 60, flexibility: "date_flexible", hint: "Thường 1–3 tỷ · 5–10 năm" },
  { id: "car", title: "Mua xe", icon: Car, defaultName: "Mua xe", amount: 600 * TR, months: 36, flexibility: "date_flexible", hint: "Thường 500–900 triệu · 2–4 năm" },
  { id: "education", title: "Học phí", icon: GraduationCap, defaultName: "Học phí cho con", amount: 200 * TR, months: 48, flexibility: "date_fixed", hint: "Thường 100–400 triệu · theo năm học" },
  { id: "travel", title: "Du lịch", icon: Plane, defaultName: "Chuyến du lịch", amount: 50 * TR, months: 12, flexibility: "amount_flexible", hint: "Thường 20–100 triệu · 6–18 tháng" },
  { id: "emergency", title: "Quỹ dự phòng", icon: LifeBuoy, defaultName: "Quỹ dự phòng", amount: 120 * TR, months: 12, flexibility: "date_flexible", hint: "Nên bằng 3–6 tháng chi tiêu" },
  { id: "retirement", title: "Hưu trí", icon: TreePalm, defaultName: "Quỹ hưu trí", amount: 2_000 * TR, months: 120, flexibility: "date_flexible", hint: "Dài hạn · 10 năm trở lên" },
  { id: "wedding", title: "Đám cưới", icon: Heart, defaultName: "Đám cưới", amount: 250 * TR, months: 18, flexibility: "date_fixed", hint: "Thường 150–400 triệu · 1–2 năm" },
  { id: "other", title: "Tự tạo", icon: Target, defaultName: "", amount: 100 * TR, months: 24, flexibility: "date_flexible", hint: "Đặt tên và số tiền theo ý bạn" },
];

/** Quỹ dự phòng = 6 tháng chi tiêu của khách (không thấp hơn mức mặc định). */
export function suggestedTarget(config: TemplateConfig, customer: PreviewState["customer"]): { amount: number; fromExpenses: boolean } {
  if (config.id !== "emergency") return { amount: config.amount, fromExpenses: false };
  const sixMonths = Math.round((customer.monthlyExpenses * 6) / 1_000_000) * 1_000_000;
  return sixMonths > config.amount ? { amount: sixMonths, fromExpenses: true } : { amount: config.amount, fromExpenses: false };
}

export function templateConfig(id: GoalTemplate | string | undefined): TemplateConfig {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}

export const FLEX_INFO: Record<"fixed" | "flexible", { value: GoalFlexibility; title: string; text: string }> = {
  fixed: { value: "date_fixed", title: "Cố định", text: "Ngày và số tiền không đổi. Nếu thiếu, bạn sẽ được gợi ý tiết kiệm thêm hoặc vay." },
  flexible: { value: "date_flexible", title: "Linh hoạt", text: "Có thể lùi ngày hoặc giảm số tiền nếu kế hoạch chưa kịp." },
};

export function isFlexible(f: GoalFlexibility): boolean {
  return f !== "date_fixed";
}

/** Target date for "n months from today" keeping a safe day of month. */
export function targetDateFromNow(today: string, months: number): string {
  const d = addMonths(today, months);
  const day = Math.min(28, dayOfMonth(today));
  return `${d.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export function previewAccountNumber(state: PreviewState): string {
  // Mirrors reducer: seq is bumped once for the account id before makeAccountNumber.
  const seq = state.seq + 1;
  const body = String((seq * 7919 + 104_729) % 100_000_000).padStart(8, "0");
  return `9668${body}`;
}

export function formatAccountNumber(n: string): string {
  return n.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export interface DraftPlan {
  world: PreviewState;
  sim: Goal;
  feas: Feasibility;
  options: GoalOptions;
  value: ReturnType<typeof goalValue>;
  /** Surplus left for this goal after goals with higher priority (and loan payments). */
  available: number | "unknown";
}

/** Evaluates the draft as if its account already held `deposit` (account is not opened yet). */
export function evalDraft(state: PreviewState, goal: Goal, deposit: number, patch?: Partial<Goal>): DraftPlan {
  const today = state.clock.today;
  const simAccount: GoalAccount = {
    id: "sim-acc",
    goalId: goal.id,
    number: "",
    name: goal.name,
    balance: deposit,
    interestRatePa: 0.5,
    openedAt: today,
    status: "open",
  };
  const world: PreviewState = { ...state, accounts: [...state.accounts, simAccount] };
  const sim: Goal = { ...goal, ...patch, status: "accumulating", accountId: "sim-acc" };
  const feas = feasibility(world, sim, sim);
  const options = goalOptions(world, sim, sim);
  const surplus = state.customer.monthlySurplus;
  let available: number | "unknown" = "unknown";
  if (surplus !== "unknown") {
    const alloc = allocateSurplus(world, sim);
    const loans = state.loans.filter((l) => l.status === "active").reduce((s, l) => s + l.monthlyPayment, 0);
    const others = Object.entries(alloc)
      .filter(([id]) => id !== sim.id)
      .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
    available = Math.max(0, surplus - loans - others);
  }
  return { world, sim, feas, options, value: goalValue(world, sim), available };
}

export function wizardDeposit(params: ScreenParams): number {
  return Math.max(0, paramNumber(params, "deposit") ?? 0);
}

export function wizardGoalId(params: ScreenParams): string | undefined {
  return paramString(params, "goalId");
}

/** Resolves the draft goal for a wizard screen, or renders a friendly fallback. */
export function DraftGuard({
  params,
  title,
  children,
}: {
  params: ScreenParams;
  title: string;
  children: (goal: Goal) => ReactNode;
}) {
  const { state } = usePreview();
  const nav = useNav();
  const goalId = wizardGoalId(params);
  const goal = goalId ? state.goals.find((g) => g.id === goalId) : undefined;
  if (!goal || goal.status !== "draft") {
    const opened = goal && goal.status !== "draft";
    return (
      <div className="flex flex-col gap-4 pb-6">
        <ScreenHeader title={title} />
        <EmptyState
          title={opened ? "Mục tiêu này đã được mở" : "Không tìm thấy bản nháp"}
          description={opened ? "Bạn có thể xem và quản lý mục tiêu trong danh sách." : "Bản nháp có thể đã bị xoá. Hãy bắt đầu lại từ đầu."}
          ctaLabel={opened ? "Xem mục tiêu" : "Tạo mục tiêu mới"}
          onCta={() => (opened ? nav.replace("GoalDetail", { goalId: goal.id }) : nav.replace("TemplatePick"))}
        />
      </div>
    );
  }
  return <>{children(goal)}</>;
}

export function monthLabel(date: string): string {
  return formatISODate(date);
}
