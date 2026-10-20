import "server-only";

/**
 * Lõi server của Mục tiêu: đọc world thật (kèm xử lý bù các ngày đã trôi qua) và
 * áp một thao tác của khách bằng CHÍNH reducer / engine thuần của client, rồi ghi
 * bút toán thật (`applyPostings`). Không bao giờ chờ đồng bộ giá.
 */

import { hydrateMarket, type MarketInstrument } from "../data/market";
import { advanceTime } from "../engine/advance";
import { addMonths, daysBetween } from "../engine/dates";
import type { PreviewState, WorldState } from "../model/state";
import type { PreviewAction } from "../store/actions";
import { previewReducer } from "../store/reducer";
import { engineNow } from "@/lib/security/clock";
import { advanceGoalClock } from "./clock";
import { buildCustomerProfile } from "./customer-context";
import { goalsV2Db } from "./db";
import { applyPostings, GoalInsufficientFundsError } from "./postings";
import { readMarketInstruments, readPriceStatus } from "./prices/repo";
import { ensurePricesFresh } from "./prices/sync";
import { loadWorld, readGoalMeta, readSimProfile, writeSimProfile } from "./world-repo";

export interface GoalsV2Market {
  instruments: MarketInstrument[];
  asOf: string | null;
  refreshing: boolean;
}

export interface GoalsV2Snapshot {
  world: WorldState;
  market: GoalsV2Market;
}

/** `createdGoalId`: id mục tiêu server tạo cho `createGoal` (cả khi gửi lại cùng `requestId`). */
export type GoalsV2ActionResult = ({ ok: true; createdGoalId?: string } & GoalsV2Snapshot) | ({ ok: false; error: string } & GoalsV2Snapshot);

// --- Danh sách cho phép (F1) ------------------------------------------------
// Server chỉ nhận thao tác nghiệp vụ liệt kê tường minh dưới đây; `world/sync`, `hydrate`,
// `loadScenario`, `reset`, `nav/*`, `toast/*`, `dismissSuggestion` và mọi
// type lạ đều bị từ chối. Mỗi trường được kiểm kiểu rồi dựng lại action sạch (bỏ trường thừa).

type Obj = Record<string, unknown>;
type Parsed = { ok: true; action: PreviewAction } | { ok: false; error: string };

const INVALID = "Dữ liệu thao tác không hợp lệ.";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Tua tối đa 10 năm một lần (engine chạy theo từng ngày). */
const MAX_ADVANCE_DAYS = 3660;
/** Số tài sản tối đa khách có thể gắn khi tạo một mục tiêu. */
const MAX_NEW_GOAL_ASSETS = 20;

const GOAL_TEMPLATES = new Set(["car", "house", "travel", "education", "emergency", "wedding", "retirement", "other"]);
/** "date_fixed" là giá trị cũ: vẫn nhận để agent/client cũ không vỡ, reducer luôn đổi thành "date_flexible". */
const FLEXIBILITIES = new Set(["date_fixed", "date_flexible", "amount_flexible"]);
const DECLARED_CATEGORIES = new Set(["house", "car", "motorbike", "other", "gold", "stock", "external_fund", "deposit", "bond"]);
const VALUE_SOURCES = new Set(["msb", "self_reported", "estimated"]);
const RISK_PROFILE_VALUES = new Set(["conservative", "balanced", "growth"]);

class InvalidAction extends Error {}
class RejectedAction extends Error {}

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
function str(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== "string" || v === "") throw new InvalidAction(k);
  return v;
}
function text(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== "string") throw new InvalidAction(k);
  return v;
}
function num(o: Obj, k: string, check: (n: number) => boolean): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isFinite(v) || !check(v)) throw new InvalidAction(k);
  return v;
}
const positive = (n: number) => n > 0;
const nonNegative = (n: number) => n >= 0;
const positiveInt = (n: number) => Number.isInteger(n) && n > 0;
function date(o: Obj, k: string): string {
  const v = str(o, k);
  if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) throw new InvalidAction(k);
  return v;
}
function oneOf<T extends string>(o: Obj, k: string, set: ReadonlySet<string>): T {
  const v = str(o, k);
  if (!set.has(v)) throw new InvalidAction(k);
  return v as T;
}
function bool(o: Obj, k: string): boolean {
  if (typeof o[k] !== "boolean") throw new InvalidAction(k);
  return o[k] as boolean;
}
/** Trường tuỳ chọn: vắng mặt → không có trong action sạch. */
function opt<T>(o: Obj, k: string, read: (o: Obj, k: string) => T): { [key: string]: T } {
  return o[k] === undefined ? {} : { [k]: read(o, k) };
}

/** Các trường của `CreateGoalInput` (chỉ đúng các khoá này). */
function goalInput(o: Obj): Obj {
  const keys = ["name", "template", "targetAmount", "targetDate", "flexibility", "priority", "note", "initialDeposit", "standingOrder", "assets", "icon"];
  if (Object.keys(o).some((k) => !keys.includes(k))) throw new InvalidAction("input");
  return {
    name: text(o, "name"),
    template: oneOf(o, "template", GOAL_TEMPLATES),
    targetAmount: num(o, "targetAmount", positive),
    targetDate: date(o, "targetDate"),
    flexibility: oneOf(o, "flexibility", FLEXIBILITIES),
    ...opt(o, "priority", (x, k) => num(x, k, positive)),
    ...opt(o, "note", text),
    ...opt(o, "icon", (x, k) => oneOf(x, k, GOAL_TEMPLATES)),
    ...opt(o, "initialDeposit", (x, k) => num(x, k, nonNegative)),
    ...opt(o, "assets", (x, k) => {
      const list = x[k];
      if (!Array.isArray(list) || list.length > MAX_NEW_GOAL_ASSETS || list.some((item) => !isObj(item))) throw new InvalidAction(k);
      return list.map((item) => declaredAssetFields(item as Obj));
    }),
    ...opt(o, "standingOrder", (x, k) => {
      const so = x[k];
      if (!isObj(so)) throw new InvalidAction(k);
      return { amount: num(so, "amount", positive), dayOfMonth: num(so, "dayOfMonth", (n) => Number.isInteger(n) && n >= 1 && n <= 31) };
    }),
  };
}

/** Các trường của một tài sản tự khai (dùng cho `addAsset` và `createGoal.input.assets`). */
function declaredAssetFields(a: Obj): Obj {
  let accrual: Obj | undefined;
  if (a.accrual !== undefined) {
    if (!isObj(a.accrual)) throw new InvalidAction("accrual");
    const r = a.accrual;
    accrual = {
      principal: num(r, "principal", positive),
      ratePa: num(r, "ratePa", nonNegative),
      startDate: date(r, "startDate"),
      ...opt(r, "maturityDate", date),
    };
  }
  return {
    name: str(a, "name"),
    category: oneOf(a, "category", DECLARED_CATEGORIES),
    value: num(a, "value", nonNegative),
    countPercent: num(a, "countPercent", (n) => n >= 0 && n <= 100),
    ...opt(a, "valuationDate", date),
    ...opt(a, "source", (x, k) => oneOf(x, k, VALUE_SOURCES)),
    ...opt(a, "instrumentId", str),
    ...opt(a, "quantity", (x, k) => num(x, k, positive)),
    ...(accrual ? { accrual } : {}),
    ...opt(a, "institution", text),
  };
}

function parseFields(type: string, a: Obj): Obj {
  const goalId = () => ({ goalId: str(a, "goalId") });
  const assetId = () => ({ assetId: str(a, "assetId") });
  const loanId = () => ({ loanId: str(a, "loanId") });
  switch (type) {
    case "advanceTime":
      return { days: num(a, "days", (n) => positiveInt(n) && n <= MAX_ADVANCE_DAYS) };
    case "setRiskProfile":
      return { profile: oneOf(a, "profile", RISK_PROFILE_VALUES) };
    case "createGoal":
      if (!isObj(a.input)) throw new InvalidAction("input");
      return { input: goalInput(a.input) };
    case "runStandingOrderNow":
    case "cancelReservedLoan":
    case "startRepayment":
    case "completeEarly":
    case "pauseGoal":
    case "resumeGoal":
    case "closeGoal":
      return goalId();
    case "deposit":
      return { ...goalId(), amount: num(a, "amount", positive), ...opt(a, "note", text) };
    case "withdraw":
      return { ...goalId(), amount: num(a, "amount", positive), ...opt(a, "note", text), ...opt(a, "emergency", bool) };
    case "setStandingOrder":
      return {
        ...goalId(),
        amount: num(a, "amount", nonNegative),
        dayOfMonth: num(a, "dayOfMonth", (n) => Number.isInteger(n) && n >= 1 && n <= 31),
        ...opt(a, "active", bool),
      };
    case "reserveLoan":
      return { ...goalId(), productId: str(a, "productId"), principal: num(a, "principal", positive), termMonths: num(a, "termMonths", positiveInt) };
    case "addAsset":
      return { ...goalId(), ...declaredAssetFields(a) };
    case "revalueAsset":
      return {
        ...assetId(),
        value: num(a, "value", nonNegative),
        ...opt(a, "countPercent", (x, k) => num(x, k, (n) => n >= 0 && n <= 100)),
        ...opt(a, "valuationDate", date),
      };
    case "removeAsset":
      return assetId();
    case "setAssetQuantity":
      return { ...assetId(), quantity: num(a, "quantity", positive) };
    case "invest":
      return { ...goalId(), productId: str(a, "productId"), amount: num(a, "amount", positive), ...opt(a, "termMonths", (x, k) => num(x, k, positiveInt)) };
    case "sellAsset":
      return {
        ...assetId(),
        ...opt(a, "fraction", (x, k) => num(x, k, (n) => n > 0 && n <= 1)),
        ...opt(a, "proceeds", (x, k) => num(x, k, nonNegative)),
      };
    case "handleMaturity":
      return {
        ...assetId(),
        choice: oneOf(a, "choice", new Set(["rollover", "toCash"])),
        ...opt(a, "termMonths", (x, k) => num(x, k, positiveInt)),
      };
    case "takeLoan":
      return {
        ...goalId(),
        productId: str(a, "productId"),
        principal: num(a, "principal", positive),
        termMonths: num(a, "termMonths", positiveInt),
        ...opt(a, "settlement", (x, k) => oneOf(x, k, new Set(["now", "next"]))),
        ...opt(a, "purchase", (x, k) => {
          const p = x[k];
          if (!isObj(p)) throw new InvalidAction(k);
          if (p.assetId !== undefined) return { assetId: str(p, "assetId") };
          return { name: str(p, "name"), category: oneOf(p, "category", DECLARED_CATEGORIES), value: num(p, "value", nonNegative) };
        }),
      };
    case "repay":
      return loanId();
    case "prepay":
      return { ...loanId(), amount: num(a, "amount", positive) };
    case "extend":
      return { ...goalId(), newTargetDate: date(a, "newTargetDate") };
    case "reduceTarget":
      return { ...goalId(), newTargetAmount: num(a, "newTargetAmount", positive) };
    case "reorderPriorities": {
      const ids = a.goalIds;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id === "")) throw new InvalidAction("goalIds");
      return { goalIds: [...(ids as string[])] };
    }
    default:
      throw new RejectedAction();
  }
}

/** Kiểm thao tác từ client: chỉ thao tác nghiệp vụ trong danh sách cho phép, đúng kiểu từng trường. */
export function parseGoalAction(raw: unknown): Parsed {
  if (!isObj(raw) || typeof raw.type !== "string") return { ok: false, error: INVALID };
  try {
    // `addFixedAsset` là tên cũ của `addAsset` (agent cũ vẫn gửi).
    const type = raw.type === "addFixedAsset" ? "addAsset" : raw.type;
    return { ok: true, action: { type, ...parseFields(type, raw) } as PreviewAction };
  } catch (err) {
    if (err instanceof RejectedAction) return { ok: false, error: "Thao tác này không dùng được với dữ liệu thật." };
    if (err instanceof InvalidAction) return { ok: false, error: INVALID };
    throw err;
  }
}

/** Nạp danh mục thị trường (giá thật đã lưu) cho engine; đồng bộ giá chạy nền nếu cần. */
function loadMarket(): GoalsV2Market {
  const instruments = readMarketInstruments();
  hydrateMarket(instruments);
  ensurePricesFresh();
  return { instruments, ...readPriceStatus() };
}

/**
 * World của khách; nếu "hôm nay" đã qua `processed_through` thì chạy engine bù các ngày đó và ghi bút toán.
 * `strict` = lỗi xử lý bù ném ra ngoài (để transaction bao ngoài huỷ cả thao tác); không strict
 * (chỉ đọc) = trả world chưa xử lý bù, lần đọc sau thử lại.
 */
function loadAndCatchUp(cif: string, strict = false): WorldState {
  const world = loadWorld(cif);
  const { processedThrough } = readGoalMeta(cif);
  if (processedThrough === null) {
    // Lần đầu: chỉ đánh dấu mốc, không chạy bù quá khứ.
    applyPostings(cif, world, structuredClone(world), null);
    return loadWorld(cif);
  }
  const days = daysBetween(processedThrough, world.clock.today);
  if (days <= 0) return world;
  const start: WorldState = {
    ...world,
    clock: { today: processedThrough },
    customer: loadWorld(cif, { profileAsOf: processedThrough }).customer,
  };
  const customer = start.customer;
  let profileToSave = customer.monthlyIncome > 0 ? {
    monthlyIncome: customer.monthlyIncome,
    monthlyExpenses: customer.monthlyExpenses,
    salaryDay: customer.salaryDay,
    asOf: processedThrough,
  } : null;
  let profile = profileToSave ?? readSimProfile(cif);
  if (!profile) {
    for (let months = 1; months <= 24; months++) {
      const asOf = addMonths(processedThrough, -months);
      const historical = buildCustomerProfile(cif, asOf, customer.riskProfile);
      if (historical.monthlyIncome <= 0) continue;
      profileToSave = {
        monthlyIncome: historical.monthlyIncome,
        monthlyExpenses: historical.monthlyExpenses,
        salaryDay: historical.salaryDay,
        asOf,
      };
      profile = profileToSave;
      break;
    }
  }
  if (profile) {
    start.customer = { ...customer, monthlyIncome: profile.monthlyIncome, monthlyExpenses: profile.monthlyExpenses, salaryDay: profile.salaryDay };
  }
  const { state: next } = advanceTime(start, days);
  try {
    goalsV2Db().transaction(() => {
      applyPostings(cif, start, next, null);
      if (profileToSave) writeSimProfile(cif, profileToSave);
    })();
  } catch (err) {
    if (strict) throw err;
    console.error("[goals-v2] catch-up postings failed", err);
    return world;
  }
  return loadWorld(cif);
}

export function getWorld(cif: string): GoalsV2Snapshot {
  const market = loadMarket();
  // Đọc + xử lý bù trong một transaction IMMEDIATE (không chen giữa thao tác của process khác).
  const world = goalsV2Db().transaction(() => loadAndCatchUp(cif)).immediate();
  return { world, market };
}
function toPreviewState(world: WorldState): PreviewState {
  return {
    ...world,
    dismissedSuggestionIds: [],
    nav: { stack: [{ key: "s0-GoalList", screen: "GoalList", params: {} }] },
    toasts: [],
  };
}

function toWorld(state: PreviewState): WorldState {
  const { version, scenarioId, customer, goals, accounts, txns, assets, loans, clock, market, seq } = state;
  return { version, scenarioId, customer, goals, accounts, txns, assets, loans, clock, market, seq };
}

/** Reducer không đổi phần dữ liệu (cùng tham chiếu) — từ chối hoặc không làm gì. `seq` bỏ qua: toast lỗi cũng tăng nó. */
function worldUnchanged(prev: PreviewState, next: PreviewState): boolean {
  return (
    prev.customer === next.customer &&
    prev.goals === next.goals &&
    prev.accounts === next.accounts &&
    prev.txns === next.txns &&
    prev.assets === next.assets &&
    prev.loans === next.loans &&
    prev.clock === next.clock &&
    prev.market === next.market
  );
}

function logAction(cif: string, requestId: string, actionType: string, createdGoalId: string | null = null): void {
  goalsV2Db()
    .prepare("INSERT OR IGNORE INTO gv2_action_log (cif, request_id, action_type, created_at, created_goal_id) VALUES (?, ?, ?, ?, ?)")
    .run(cif, requestId, actionType, new Date().toISOString(), createdGoalId);
}

/** Kết quả trong transaction: ghi xong, hoặc reducer / kiểm số dư từ chối (không ghi gì). */
type Outcome = { ok: true; createdGoalId?: string } | { ok: false; error: string };

/**
 * Áp một thao tác của khách. `action` từ client được kiểm bằng `parseGoalAction` (F1).
 * Đọc world, chạy reducer, ghi bút toán và `gv2_action_log` trong CÙNG một transaction
 * `IMMEDIATE` (R4, D23). `advanceTime`: tua đồng hồ, xử lý bù và ghi log cùng thành
 * công hoặc cùng huỷ — xử lý bù lỗi thì đồng hồ trở lại như cũ và ném lỗi (route → 500) (R2).
 */
export function applyAction(cif: string, requestId: string, rawAction: unknown): GoalsV2ActionResult {
  const parsed = parseGoalAction(rawAction);
  if (!parsed.ok) return { ok: false, error: parsed.error, ...getWorld(cif) };
  const action = parsed.action;
  const market = loadMarket();
  const db = goalsV2Db();

  const outcome = db
    .transaction((): Outcome => {
      const seen = db
        .prepare("SELECT created_goal_id FROM gv2_action_log WHERE cif = ? AND request_id = ?")
        .get(cif, requestId) as { created_goal_id: string | null } | undefined;
      if (seen) {
        // Gửi lại cùng `requestId`: trả lại id mục tiêu đã tạo lần đầu (N2).
        return action.type === "createGoal" && seen.created_goal_id ? { ok: true, createdGoalId: seen.created_goal_id } : { ok: true };
      }

      if (action.type === "advanceTime") {
        advanceGoalClock(cif, action.days);
        loadAndCatchUp(cif, true);
        logAction(cif, requestId, action.type);
        return { ok: true };
      }

      const world = loadAndCatchUp(cif, true);
      const state = toPreviewState(world);
      const next = previewReducer(state, action);
      if (worldUnchanged(state, next)) {
        const last = next.toasts[next.toasts.length - 1];
        if (next.toasts.length > state.toasts.length && last?.tone === "error") return { ok: false, error: last.message };
        logAction(cif, requestId, action.type);
        return { ok: true };
      }
      try {
        // Savepoint riêng: thiếu số dư chỉ huỷ phần bút toán, không ghi log.
        db.transaction(() => applyPostings(cif, world, toWorld(next), engineNow(cif).toISOString()))();
      } catch (err) {
        if (err instanceof GoalInsufficientFundsError) return { ok: false, error: err.message };
        throw err;
      }
      const createdGoalId = action.type === "createGoal" ? next.lastCreatedGoalId : undefined;
      logAction(cif, requestId, action.type, createdGoalId ?? null);
      return createdGoalId ? { ok: true, createdGoalId } : { ok: true };
    })
    .immediate();

  const world = db.transaction(() => loadAndCatchUp(cif)).immediate();
  if (!outcome.ok) return { ok: false, error: outcome.error, world, market };
  return outcome.createdGoalId ? { ok: true, createdGoalId: outcome.createdGoalId, world, market } : { ok: true, world, market };
}
