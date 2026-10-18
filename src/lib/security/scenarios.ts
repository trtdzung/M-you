// Scam Shield scenario resolver: signals → level (spec section 2) → scenario
// (section 3) → what to show, plus how often each scenario may show. Pure: the
// orchestrator (E08) supplies the history; copy comes only from scenario-copy.ts.

import { CLASSIFY_QUESTIONS, DH8_CONTEXT, SCENARIO_COPY, type ScenarioId, type ScenarioLevel, type Surface } from "./scenario-copy";
import type { Signal } from "./signals";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type Rendered = { message: string; question: string | null; chips: string[]; emphasis: string[] };

export type TransferResolution = {
  level: ScenarioLevel;
  /** Every scenario the signals match; the first is the one shown. */
  scenarios: ScenarioId[];
  primary: ScenarioId | null;
  surface: Surface | null;
  countdownSec: number | null;
  classify: boolean;
  copy: Rendered | null;
  /** T1 present: UC 10 may hold the transfer if the amount passes the customer's threshold. */
  holdEligible: boolean;
};

const has = (signals: Signal[], code: Signal["code"]) => signals.find(s => s.code === code);

/** "120 triệu", "1,5 triệu", "50k" — the spec's way of writing amounts in copy. */
export function shortVnd(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = Math.round((amount / 1_000_000) * 10) / 10;
    return `${millions.toLocaleString("vi-VN")} triệu`;
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

/** The scenario's copy with run-time values filled in. */
export function renderScenario(id: ScenarioId, vars: Record<string, string> = {}): Rendered {
  const copy = SCENARIO_COPY[id];
  return {
    message: fill(copy.message, vars),
    question: copy.question ? fill(copy.question, vars) : null,
    chips: copy.chips,
    emphasis: copy.emphasis,
  };
}

/** DH8: "Dòng đầu giữ như kịch bản Vàng tương ứng, thêm: …và <ngữ cảnh>". */
export function renderDh8(base: ScenarioId, t8: Signal): Rendered {
  const parts: string[] = [];
  if (t8.facts.night) parts.push(DH8_CONTEXT.night);
  const words = typeof t8.facts.words === "string" && t8.facts.words ? t8.facts.words.split(",") : [];
  if (words.length) parts.push(DH8_CONTEXT.words(words));
  if (t8.facts.screenSharing) parts.push(DH8_CONTEXT.screenSharing);
  const baseLine = SCENARIO_COPY[base].message.replace(/[.\s]+$/, "");
  return {
    message: `${baseLine} …và ${parts.join(", ")}.`,
    question: CLASSIFY_QUESTIONS[0],
    chips: SCENARIO_COPY.DH8.chips,
    emphasis: SCENARIO_COPY[base].emphasis,
  };
}

const CHANGE_WORDS: Record<string, string> = { device_login: "đăng nhập thiết bị mới", password_changed: "đổi mật khẩu", phone_changed: "đổi số điện thoại" };

// Shown first when several match: strong signals before medium, then the spec order.
const RED_ORDER: ScenarioId[] = ["DH4", "DH5", "DH6", "DH7", "DH-T5", "DH8"];
const YELLOW_ORDER: ScenarioId[] = ["DH1", "DH3", "DH3-2", "DH2"];

/** Spec section 2, row by row. P3 and P4 are agent context and are not read here. */
export function resolveTransfer(signals: Signal[]): TransferResolution {
  const t1 = !!has(signals, "T1");
  const t3 = !!has(signals, "T3");
  const t6 = has(signals, "T6");
  const order = Number(t6?.facts.orderIndex ?? 0);
  const t7b = has(signals, "T7b");
  const t8 = has(signals, "T8");

  // Vàng: T1b · T1 + T3 · T1 + T6 (lệnh thứ 2); DH3 is the 3rd order of the same chain.
  const yellow: ScenarioId[] = [];
  if (has(signals, "T1b")) yellow.push("DH1");
  if (t1 && t6 && order >= 3) yellow.push("DH3");
  else if (t1 && t6 && order === 2) yellow.push("DH3-2");
  if (t1 && t3) yellow.push("DH2");

  // Đỏ: T2 · T1 + T4 · T1 + T5 + T3 · T1 + T6 + T7a (từ lệnh thứ 3) · T1 + T7b (≥ 80% vừa nhận trong 24h) · Vàng + T8.
  const red: ScenarioId[] = [];
  if (has(signals, "T2")) red.push("DH4");
  if (t1 && has(signals, "T4")) red.push("DH5");
  if (t1 && t6 && order >= 3 && has(signals, "T7a")) red.push("DH6");
  if (t1 && t7b && Number(t7b.facts.shareOfRecent ?? 0) >= 0.8) red.push("DH7");
  if (t1 && t3 && has(signals, "T5")) red.push("DH-T5");
  const baseYellow = YELLOW_ORDER.find(id => yellow.includes(id)) ?? null;
  if (baseYellow && t8) red.push("DH8");

  const level: ScenarioLevel = red.length ? "red" : yellow.length ? "yellow" : "green";
  const scenarios = level === "red" ? [...RED_ORDER.filter(id => red.includes(id)), ...YELLOW_ORDER.filter(id => yellow.includes(id))]
    : YELLOW_ORDER.filter(id => yellow.includes(id));
  const primary = scenarios[0] ?? null;
  if (!primary) return { level, scenarios, primary, surface: null, countdownSec: null, classify: false, copy: null, holdEligible: t1 };

  const copy = SCENARIO_COPY[primary];
  const countdowns = scenarios.map(id => SCENARIO_COPY[id].countdownSec).filter((s): s is number => s !== null);
  const vars: Record<string, string> = {};
  const t4 = has(signals, "T4");
  if (t4) vars.amount = shortVnd(Number(t4.facts.total));
  const t5 = has(signals, "T5");
  if (t5) vars.change = String(t5.facts.kinds).split(",").map(k => CHANGE_WORDS[k] ?? k).join(", ");
  let rendered = primary === "DH8" && baseYellow && t8 ? renderDh8(baseYellow, t8) : renderScenario(primary, vars);
  if (copy.classify && !rendered.question) rendered = { ...rendered, question: CLASSIFY_QUESTIONS[0] };
  // DH7's own chip stays when another red scenario is shown first.
  if (level === "red" && primary !== "DH7" && red.includes("DH7")) rendered = { ...rendered, chips: SCENARIO_COPY.DH7.chips };
  return {
    level, scenarios, primary, surface: copy.surface,
    countdownSec: level === "red" ? Math.max(...countdowns) : null,
    classify: copy.classify, copy: rendered, holdEligible: t1,
  };
}

// --- How often a scenario may show (spec column "Tần suất") -----------------

export type FrequencyRule =
  | { kind: "always" }                                   // Mỗi lần / Mọi lần / Khi KH dùng / Mỗi lần kích hoạt
  | { kind: "once" }                                     // 1 lần duy nhất
  | { kind: "window"; ms: number }                       // Tối đa 1 lần/tháng · 1 lần/7 ngày
  | { kind: "perKey" }                                   // 1 lần mỗi người nhận
  | { kind: "perKeyWindow"; ms: number; answeredOnly: boolean } // DH1: không lặp với cùng người nhận đã xác nhận trong 30 ngày
  | { kind: "untilDone" };                               // SC4: đến khi xong

export const FREQUENCY: Record<ScenarioId, FrequencyRule> = {
  BT1: { kind: "once" },
  BT2: { kind: "window", ms: 30 * DAY_MS },
  BT3: { kind: "window", ms: 30 * DAY_MS },
  BT4: { kind: "window", ms: 7 * DAY_MS },
  BT5: { kind: "always" },
  BT6: { kind: "perKey" },
  BT7: { kind: "always" },
  DH1: { kind: "perKeyWindow", ms: 30 * DAY_MS, answeredOnly: true },
  DH2: { kind: "always" },
  DH3: { kind: "always" },
  "DH3-2": { kind: "always" },
  DH4: { kind: "always" },
  DH5: { kind: "always" },
  DH6: { kind: "always" },
  DH7: { kind: "always" },
  DH8: { kind: "always" },
  "DH-T5": { kind: "always" },
  SC1: { kind: "always" },
  SC2: { kind: "once" },
  SC3: { kind: "always" },
  SC4: { kind: "untilDone" },
  EDU: { kind: "window", ms: 7 * DAY_MS },
  HUB: { kind: "perKey" },
};

/** One earlier showing of a scenario: when, for which key (recipient…), and whether the customer confirmed. */
export type ShownBefore = { scenario: ScenarioId; at: number; key: string | null; confirmed: boolean };

/** True when the scenario may show now. SC2 "once" means once per incident: pass that incident's history only. */
export function frequencyAllows(id: ScenarioId, history: ShownBefore[], now: number, key: string | null = null): boolean {
  const rule = FREQUENCY[id];
  const mine = history.filter(h => h.scenario === id);
  switch (rule.kind) {
    case "always":
    case "untilDone":
      return true;
    case "once":
      return mine.length === 0;
    case "window":
      return !mine.some(h => now - h.at < rule.ms);
    case "perKey":
      return !mine.some(h => h.key === key);
    case "perKeyWindow":
      return !mine.some(h => h.key === key && now - h.at < rule.ms && (!rule.answeredOnly || h.confirmed));
  }
}

// --- Moments outside a transfer: BT1–BT6, SC3, SC4 ---------------------------

export type MomentContext = {
  now: number;
  trigger: "app_open" | "transfer_screen_open" | "hub_open" | "incoming_credit" | "transfer_success" | "device_login";
  /** BT1: days since the account was opened. */
  accountAgeDays?: number | null;
  /** BT2: current security score, level and the quickest steps up (Hub's own score). */
  score?: { total: number; level: "Rất cao" | "Cao" | "Tiêu chuẩn"; steps?: { label: string; points: number; cta: string }[] } | null;
  /** BT3: the credit that just arrived (or the latest within the last day, for "lần mở app kế tiếp"). */
  credit?: { amount: number; kind: "salary" | "income" | "transfer" } | null;
  hasActiveEmergencyContact?: boolean;
  /** BT4 / BT5: money-in signals (T7a / T7b). */
  incomingSignals?: Signal[];
  /** BT6: same recipient paid again within 5 minutes. */
  repeatRecipientKey?: string | null;
  /** SC3: an open fraud case and when it was opened. */
  caseOpenedAt?: number | null;
  /** SC4: recovery steps still to do (0 = done). */
  recoveryStepsLeft?: number | null;
};

export type Moment = { scenario: ScenarioId; key: string | null; copy: Rendered; urgent?: boolean };

const BT3_MIN = 50_000_000;

// BT2 keeps the spec sentence and fills in the customer's two quickest steps (Hub score).
const STEP_PHRASE: Record<string, string> = {
  "Mã chống giả mạo": "bật mã chống giả mạo",
  "Người thân khẩn cấp": "thêm người thân khẩn cấp",
  "Đổi mật khẩu": "đổi mật khẩu",
  "M-You bảo vệ bạn": "bật M-You bảo vệ bạn",
  "Xác thực nâng cao": "thiết lập xác thực nâng cao",
  "Danh bạ tin cậy": "thêm người vào danh bạ tin cậy",
};

function renderBt2(score: NonNullable<MomentContext["score"]>): Rendered {
  const [first, second] = score.steps ?? [];
  if (!first || !second) return renderScenario("BT2", { score: String(score.total) });
  const phrase = (step: { label: string }) => STEP_PHRASE[step.label] ?? step.label.toLowerCase();
  const head = phrase(first);
  return {
    message: `Điểm bảo mật: ${score.total}/100. ${head.charAt(0).toUpperCase()}${head.slice(1)} (+${first.points}) và ${phrase(second)} (+${second.points}) để lên mức Cao.`,
    question: null,
    chips: [first.cta, second.cta],
    emphasis: [],
  };
}

/** UC11: two fastest score steps. Uses the gauge total when the Hub sent it. */
export function renderHubGuide(steps: { label: string; points: number; cta: string }[], total: number | null): Rendered {
  if (total != null) return renderBt2({ total, level: "Tiêu chuẩn", steps });
  const [first, second] = steps;
  if (!first || !second) return { message: "", question: null, chips: [], emphasis: [] };
  const phrase = (step: { label: string }) => STEP_PHRASE[step.label] ?? step.label.toLowerCase();
  return {
    message: `Hai việc tăng điểm nhanh nhất: ${phrase(first)} (+${first.points}) và ${phrase(second)} (+${second.points}).`,
    question: null,
    chips: [first.cta, second.cta],
    emphasis: [],
  };
}

/** Every BT/SC scenario the moment matches, before the frequency check. */
export function resolveMoment(ctx: MomentContext): Moment[] {
  const out: Moment[] = [];
  const add = (scenario: ScenarioId, vars: Record<string, string> = {}, key: string | null = null) =>
    out.push({ scenario, key, copy: renderScenario(scenario, vars) });

  if ((ctx.trigger === "transfer_screen_open" || ctx.trigger === "app_open") && ctx.accountAgeDays != null && ctx.accountAgeDays <= 7) add("BT1");
  if (ctx.trigger === "hub_open" && ctx.score && ctx.score.level === "Tiêu chuẩn") out.push({ scenario: "BT2", key: null, copy: renderBt2(ctx.score) });
  if ((ctx.trigger === "incoming_credit" || ctx.trigger === "app_open") && ctx.credit && ctx.credit.amount >= BT3_MIN && !ctx.hasActiveEmergencyContact) {
    add("BT3", { amount: shortVnd(ctx.credit.amount) });
  }
  if (ctx.trigger === "incoming_credit") {
    const t7a = ctx.incomingSignals?.find(s => s.code === "T7a");
    const t7b = ctx.incomingSignals?.find(s => s.code === "T7b");
    if (t7a) add("BT4", { amount: shortVnd(Number(t7a.facts.total) / Number(t7a.facts.count || 1)) }, String(t7a.facts.senderKey ?? ""));
    if (t7b) add("BT5", { amount: shortVnd(Number(t7b.facts.received)) });
  }
  if (ctx.trigger === "transfer_success" && ctx.repeatRecipientKey) add("BT6", {}, ctx.repeatRecipientKey);
  if (ctx.caseOpenedAt != null && ctx.now - ctx.caseOpenedAt <= 30 * DAY_MS) add("SC3");
  if (ctx.trigger === "hub_open" && ctx.recoveryStepsLeft != null && ctx.recoveryStepsLeft > 0) add("SC4");
  return out;
}
