"use client";

import { Car, GraduationCap, Heart, House, LifeBuoy, Plane, Target, TreePalm, type LucideIcon } from "lucide-react";
import { addMonths, dayOfMonth, formatISODate } from "../../../engine/dates";
import { goalAccountNumber } from "../../../engine/ledger";
import type { PreviewState } from "../../../model/state";
import type { ScreenParams } from "../../../model/screens";
import { paramNumber, paramString } from "../../../model/screens";
import type { GoalFlexibility, GoalTemplate } from "../../../model/types";
import type { DeclaredAssetInput } from "../../../store/actions";

export const WIZARD_STEPS = ["Chọn mục tiêu", "Lập kế hoạch", "Mở tài khoản"];

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
  /** Quick-pick target amounts on the info step. */
  quickAmounts: number[];
}

const TR = 1_000_000;

export const TEMPLATES: TemplateConfig[] = [
  { id: "house", title: "Mua nhà", icon: House, defaultName: "Mua nhà", amount: 1_500 * TR, months: 60, flexibility: "date_flexible", hint: "Thường 1–3 tỷ · 5–10 năm", quickAmounts: [1_000 * TR, 1_500 * TR, 2_000 * TR, 3_000 * TR] },
  { id: "car", title: "Mua xe", icon: Car, defaultName: "Mua xe", amount: 600 * TR, months: 36, flexibility: "date_flexible", hint: "Thường 500–900 triệu · 2–4 năm", quickAmounts: [400 * TR, 600 * TR, 800 * TR, 1_000 * TR] },
  { id: "education", title: "Học phí", icon: GraduationCap, defaultName: "Học phí cho con", amount: 200 * TR, months: 48, flexibility: "date_flexible", hint: "Thường 100–400 triệu · theo năm học", quickAmounts: [100 * TR, 200 * TR, 300 * TR, 400 * TR] },
  { id: "travel", title: "Du lịch", icon: Plane, defaultName: "Chuyến du lịch", amount: 50 * TR, months: 12, flexibility: "amount_flexible", hint: "Thường 20–100 triệu · 6–18 tháng", quickAmounts: [30 * TR, 50 * TR, 80 * TR, 100 * TR] },
  { id: "emergency", title: "Quỹ dự phòng", icon: LifeBuoy, defaultName: "Quỹ dự phòng", amount: 120 * TR, months: 12, flexibility: "date_flexible", hint: "Nên bằng 3–6 tháng chi tiêu", quickAmounts: [60 * TR, 120 * TR, 180 * TR] },
  { id: "retirement", title: "Hưu trí", icon: TreePalm, defaultName: "Quỹ hưu trí", amount: 2_000 * TR, months: 120, flexibility: "date_flexible", hint: "Dài hạn · 10 năm trở lên", quickAmounts: [1_000 * TR, 2_000 * TR, 3_000 * TR, 5_000 * TR] },
  { id: "wedding", title: "Đám cưới", icon: Heart, defaultName: "Đám cưới", amount: 250 * TR, months: 18, flexibility: "date_flexible", hint: "Thường 150–400 triệu · 1–2 năm", quickAmounts: [150 * TR, 250 * TR, 400 * TR] },
  { id: "other", title: "Tự tạo", icon: Target, defaultName: "", amount: 100 * TR, months: 24, flexibility: "date_flexible", hint: "Đặt tên và số tiền theo ý bạn", quickAmounts: [50 * TR, 100 * TR, 200 * TR, 500 * TR] },
];

/** Quỹ dự phòng = 6 tháng chi tiêu của khách (không thấp hơn mức mặc định). */
export function suggestedTarget(config: TemplateConfig, customer: PreviewState["customer"]): { amount: number; fromExpenses: boolean } {
  if (config.id !== "emergency") return { amount: config.amount, fromExpenses: false };
  const sixMonths = Math.round((customer.monthlyExpenses * 6) / 1_000_000) * 1_000_000;
  return sixMonths > config.amount ? { amount: sixMonths, fromExpenses: true } : { amount: config.amount, fromExpenses: false };
}

/** Quick picks for the amount field; the emergency fund uses 3 / 6 / 12 months of spending. */
export function quickAmountsFor(config: TemplateConfig, customer: PreviewState["customer"]): number[] {
  if (config.id !== "emergency" || customer.monthlyExpenses <= 0) return config.quickAmounts;
  return [3, 6, 12].map((m) => Math.round((customer.monthlyExpenses * m) / 1_000_000) * 1_000_000);
}

export function templateConfig(id: GoalTemplate | string | undefined): TemplateConfig {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}

/** Target date for "n months from today" keeping a safe day of month. */
export function targetDateFromNow(today: string, months: number): string {
  const d = addMonths(today, months);
  const day = Math.min(28, dayOfMonth(today));
  return `${d.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** Số tài khoản dự kiến: createGoal bump seq hai lần (id mục tiêu, id tài khoản); server đổi nếu trùng. */
export function previewAccountNumber(state: PreviewState): string {
  return goalAccountNumber(state.customer.cif, state.seq + 2);
}

export function formatAccountNumber(n: string): string {
  return n.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function wizardDeposit(params: ScreenParams): number {
  return Math.max(0, paramNumber(params, "deposit") ?? 0);
}

/** Kế hoạch đang soạn trong quy trình tạo: giữ ở tham số màn hình, chưa tạo gì cho đến khi xác nhận. */
export interface WizardPlan {
  name: string;
  template: GoalTemplate;
  targetAmount: number;
  targetDate: string;
  assets: DeclaredAssetInput[];
  /** Logo khách chọn cho mục tiêu tuỳ chỉnh. */
  icon?: GoalTemplate;
}

/** Tài sản có sẵn khách đã thêm trong lúc tạo (lưu ở tham số `assets`, dạng JSON). */
export function wizardAssets(params: ScreenParams): DeclaredAssetInput[] {
  const raw = paramString(params, "assets");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DeclaredAssetInput[]) : [];
  } catch {
    return [];
  }
}

/** Phần giá trị của tài sản được tính vào mục tiêu. */
export function countedValue(asset: DeclaredAssetInput): number {
  return Math.round((asset.value * asset.countPercent) / 100);
}

export function wizardPlan(params: ScreenParams): WizardPlan | null {
  const name = paramString(params, "name");
  const targetAmount = paramNumber(params, "targetAmount");
  const targetDate = paramString(params, "targetDate");
  if (!name || !targetAmount || !targetDate) return null;
  return { name, template: (paramString(params, "template") ?? "other") as GoalTemplate, targetAmount, targetDate, assets: wizardAssets(params), ...(paramString(params, "icon") ? { icon: paramString(params, "icon") as GoalTemplate } : {}) };
}

export function monthLabel(date: string): string {
  return formatISODate(date);
}
