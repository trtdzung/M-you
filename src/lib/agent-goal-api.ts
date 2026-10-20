import type { PreviewAction } from "@/features/goals-preview/store/actions";
import type { UiPayload } from "./agent-api";

/**
 * The agent's goal proposals (contract: agent-docs/agent-to-backend/goals/): create a goal, change its date / amount,
 * close it, add an outside asset, change or remove one. Like the jar proposals, the agent never writes — every field is
 * editable on the card and the customer's confirm sends the real action to `POST /api/goals-v2/actions`.
 * The guards check SHAPE only (never throw); ids, dates against the app clock and money are re-checked by the server.
 */

export type GoalTemplate = "car" | "house" | "travel" | "education" | "emergency" | "wedding" | "retirement" | "other";
export type GoalFlexibility = "date_fixed" | "date_flexible" | "amount_flexible";
export type AssetCategory = "house" | "car" | "motorbike" | "other" | "gold" | "stock" | "external_fund" | "deposit" | "bond";

export interface CreateGoalUi {
  type: "create_goal";
  goal_name: string;
  template: GoalTemplate;
  target_amount: number;
  target_date: string;
  /** Không còn dùng (mọi mục tiêu đều linh hoạt); vẫn nhận để agent cũ không bị bỏ form. */
  flexibility?: GoalFlexibility;
  initial_deposit: number;
  /** Kế hoạch góp: số tiền trích tự động mỗi tháng và ngày trích (cùng có hoặc cùng không có). */
  monthly_amount?: number;
  monthly_day?: number;
  reason: string;
}
export interface EditGoalUi {
  type: "edit_goal";
  goal_id: string;
  goal_name: string;
  new_target_date?: string;
  new_target_amount?: number;
  /** Đổi kế hoạch góp: số tiền trích tự động mỗi tháng và ngày trích (cùng có hoặc cùng không có). */
  monthly_amount?: number;
  monthly_day?: number;
  reason: string;
}
export interface CloseGoalUi {
  type: "close_goal";
  goal_id: string;
  goal_name: string;
  reason: string;
}
export interface Accrual {
  principal: number;
  rate_pa: number;
  start_date: string;
  maturity_date?: string;
}
export interface AddAssetUi {
  type: "add_asset";
  goal_id: string;
  category: AssetCategory;
  asset_name: string;
  count_percent: number;
  value?: number;
  instrument_id?: string;
  quantity?: number;
  accrual?: Accrual;
  institution?: string;
  reason: string;
}
export interface EditAssetUi {
  type: "edit_asset";
  asset_id: string;
  asset_name: string;
  change: "revalue" | "quantity" | "remove";
  value?: number;
  count_percent?: number;
  quantity?: number;
  reason: string;
}
export type GoalUi = CreateGoalUi | EditGoalUi | CloseGoalUi | AddAssetUi | EditAssetUi;

export const TEMPLATE_LABELS: Record<GoalTemplate, string> = {
  car: "Mua xe",
  house: "Mua nhà",
  travel: "Du lịch",
  education: "Học tập",
  emergency: "Quỹ dự phòng",
  wedding: "Cưới hỏi",
  retirement: "Hưu trí",
  other: "Khác",
};
export const FLEXIBILITY_LABELS: Record<GoalFlexibility, string> = {
  date_fixed: "Đúng hạn",
  date_flexible: "Có thể lùi ngày",
  amount_flexible: "Có thể giảm số tiền",
};
export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  house: "Nhà",
  car: "Xe ô tô",
  motorbike: "Xe máy",
  other: "Tài sản khác",
  gold: "Vàng",
  stock: "Cổ phiếu",
  external_fund: "Quỹ (nơi khác)",
  deposit: "Tiền gửi (nơi khác)",
  bond: "Trái phiếu (nơi khác)",
};

const TEMPLATES = new Set(Object.keys(TEMPLATE_LABELS));
const FLEXIBILITIES = new Set(Object.keys(FLEXIBILITY_LABELS));
const HAND = new Set(["house", "car", "motorbike", "other"]);
const MARKET = new Set(["gold", "stock", "external_fund"]);
const ACCRUING = new Set(["deposit", "bond"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const money = (v: unknown, min = 1): v is number => num(v) && Number.isInteger(v) && v >= min;
const percent = (v: unknown): v is number => num(v) && v >= 0 && v <= 100;
const isoDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));
/** Ngày trích tự động hằng tháng: 1–28 (pfm không nhận ngày 29–31). */
export const MONTHLY_DAY_MAX = 28;
const monthDay = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 1 && v <= MONTHLY_DAY_MAX;
/** `monthly_amount` và `monthly_day` cùng có (đúng kiểu) hoặc cùng không có. */
const monthlyPlan = (f: { monthly_amount?: unknown; monthly_day?: unknown }): boolean =>
  f.monthly_amount === undefined && f.monthly_day === undefined
    ? true
    : f.monthly_amount !== undefined && f.monthly_day !== undefined && money(f.monthly_amount) && monthDay(f.monthly_day);
const only = (f: object, allowed: string[]) =>
  Object.entries(f).every(([k, v]) => v === undefined || allowed.includes(k));

export function isCreateGoalUi(ui: UiPayload | null | undefined): ui is CreateGoalUi {
  if (!ui || ui.type !== "create_goal") return false;
  const f = ui as Partial<CreateGoalUi>;
  return (
    only(f, ["type", "goal_name", "template", "target_amount", "target_date", "flexibility", "initial_deposit", "monthly_amount", "monthly_day", "reason"]) &&
    nonEmpty(f.goal_name) &&
    typeof f.template === "string" && TEMPLATES.has(f.template) &&
    money(f.target_amount) &&
    isoDate(f.target_date) &&
    (f.flexibility === undefined || (typeof f.flexibility === "string" && FLEXIBILITIES.has(f.flexibility))) &&
    money(f.initial_deposit, 0) &&
    monthlyPlan(f) &&
    nonEmpty(f.reason)
  );
}

export function isEditGoalUi(ui: UiPayload | null | undefined): ui is EditGoalUi {
  if (!ui || ui.type !== "edit_goal") return false;
  const f = ui as Partial<EditGoalUi>;
  if (!only(f, ["type", "goal_id", "goal_name", "new_target_date", "new_target_amount", "monthly_amount", "monthly_day", "reason"])) return false;
  if (f.new_target_date === undefined && f.new_target_amount === undefined && f.monthly_amount === undefined) return false;
  if (!monthlyPlan(f)) return false;
  if (f.new_target_date !== undefined && !isoDate(f.new_target_date)) return false;
  if (f.new_target_amount !== undefined && !money(f.new_target_amount)) return false;
  return nonEmpty(f.goal_id) && nonEmpty(f.goal_name) && nonEmpty(f.reason);
}

export function isCloseGoalUi(ui: UiPayload | null | undefined): ui is CloseGoalUi {
  if (!ui || ui.type !== "close_goal") return false;
  const f = ui as Partial<CloseGoalUi>;
  return only(f, ["type", "goal_id", "goal_name", "reason"]) && nonEmpty(f.goal_id) && nonEmpty(f.goal_name) && nonEmpty(f.reason);
}

function validAccrual(a: unknown): a is Accrual {
  if (!a || typeof a !== "object") return false;
  const f = a as Partial<Accrual>;
  if (!only(f, ["principal", "rate_pa", "start_date", "maturity_date"])) return false;
  if (!money(f.principal) || !num(f.rate_pa) || f.rate_pa < 0 || !isoDate(f.start_date)) return false;
  return f.maturity_date === undefined || (isoDate(f.maturity_date) && f.maturity_date >= f.start_date);
}

export function isAddAssetUi(ui: UiPayload | null | undefined): ui is AddAssetUi {
  if (!ui || ui.type !== "add_asset") return false;
  const f = ui as Partial<AddAssetUi>;
  const common = ["type", "goal_id", "category", "asset_name", "count_percent", "reason", "institution"];
  let allowed: string[];
  let specific: boolean;
  if (typeof f.category === "string" && HAND.has(f.category)) {
    allowed = [...common, "value"];
    specific = money(f.value);
  } else if (typeof f.category === "string" && MARKET.has(f.category)) {
    allowed = [...common, "instrument_id", "quantity"];
    specific = nonEmpty(f.instrument_id) && num(f.quantity) && f.quantity > 0;
  } else if (typeof f.category === "string" && ACCRUING.has(f.category)) {
    allowed = [...common, "accrual"];
    specific = validAccrual(f.accrual);
  } else {
    return false;
  }
  return (
    only(f, allowed) &&
    specific &&
    (f.institution === undefined || typeof f.institution === "string") &&
    nonEmpty(f.goal_id) &&
    nonEmpty(f.asset_name) &&
    percent(f.count_percent) &&
    nonEmpty(f.reason)
  );
}

export function isEditAssetUi(ui: UiPayload | null | undefined): ui is EditAssetUi {
  if (!ui || ui.type !== "edit_asset") return false;
  const f = ui as Partial<EditAssetUi>;
  if (!(nonEmpty(f.asset_id) && nonEmpty(f.asset_name) && nonEmpty(f.reason))) return false;
  const base = ["type", "asset_id", "asset_name", "change", "reason"];
  if (f.change === "revalue") return only(f, [...base, "value", "count_percent"]) && money(f.value) && (f.count_percent === undefined || percent(f.count_percent));
  if (f.change === "quantity") return only(f, [...base, "quantity"]) && num(f.quantity) && f.quantity > 0;
  if (f.change === "remove") return only(f, base);
  return false;
}

export function isGoalUi(ui: UiPayload | null | undefined): ui is GoalUi {
  return isCreateGoalUi(ui) || isEditGoalUi(ui) || isCloseGoalUi(ui) || isAddAssetUi(ui) || isEditAssetUi(ui);
}

// --- names (for the cards) --------------------------------------------------------------------------------------------

export interface GoalsNames {
  goals: { id: string; name: string; status: string }[];
  assets: { id: string; goalId: string; name: string }[];
}

const NAMES_TTL_MS = 30_000;
const namesCache = new Map<string, { at: number; value: Promise<GoalsNames | null> }>();

/**
 * Goal and asset names of a customer (`GET /api/goals-v2?scope=names`), so a card can say WHICH goal it adds to / edits.
 * Cached for a few seconds per customer (many cards in one chat); never throws, `null` when it cannot be read.
 */
export function fetchGoalsNames(cif: string): Promise<GoalsNames | null> {
  const hit = namesCache.get(cif);
  if (hit && Date.now() - hit.at < NAMES_TTL_MS) return hit.value;
  const value = (async () => {
    try {
      const res = await fetch(`/api/goals-v2?cif=${encodeURIComponent(cif)}&scope=names`);
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<GoalsNames> | null;
      return body && Array.isArray(body.goals) && Array.isArray(body.assets) ? (body as GoalsNames) : null;
    } catch {
      return null;
    }
  })();
  namesCache.set(cif, { at: Date.now(), value });
  return value;
}

/** For tests: forget cached names. */
export function clearGoalsNamesCache(): void {
  namesCache.clear();
}

// --- writing -----------------------------------------------------------------------------------------------------------

export type GoalActionResult = { ok: true; createdGoalId?: string } | { ok: false; error: string };

export const GOAL_SAVE_FAILED = "Không lưu được thay đổi. Vui lòng thử lại.";

/**
 * One business action through `POST /api/goals-v2/actions`. `requestId` is new per call, so a customer's second click is a
 * new action; the server rejects a refused action with 422 `{ error }` (shown as is, it is Vietnamese) and writes nothing.
 */
export async function sendGoalAction(cif: string, action: PreviewAction): Promise<GoalActionResult> {
  try {
    const res = await fetch("/api/goals-v2/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cif, requestId: crypto.randomUUID(), action }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { createdGoalId?: unknown } | null;
      return typeof body?.createdGoalId === "string" && body.createdGoalId !== "" ? { ok: true, createdGoalId: body.createdGoalId } : { ok: true };
    }
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return { ok: false, error: typeof body?.error === "string" && body.error !== "" ? body.error : "Thao tác không được chấp nhận." };
    }
  } catch {
    // network error: falls through to the generic message
  }
  return { ok: false, error: GOAL_SAVE_FAILED };
}
