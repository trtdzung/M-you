import "server-only";

/**
 * Nối agent `POST /goal-suggestions` (T8): dựng request từ world + tín hiệu, gọi ở nền,
 * kiểm tra lại lời agent như `guard.py` (số ⊆ facts, thao tác ⊆ allowed, độ dài) rồi
 * lưu bằng `saveAgentWording`. Lời không hợp lệ bị bỏ, thẻ giữ lời viết sẵn.
 */

import { forwardToAgent } from "@/lib/agent-proxy-auth";
import { formatISODate, monthsLeft } from "../../engine/dates";
import { goalStage, progressPct, goalValue } from "../../engine/value";
import type { WorldState } from "../../model/state";
import { goalToday } from "../clock";
import { factKeys, numberKeys, type SuggestionSignal } from "./signals";
import { readSuggestionFeedback, saveAgentWording, signalFingerprint } from "./store";

export const MAX_TITLE_LEN = 60;
export const MAX_BODY_LEN = 220;
const AGENT_TIMEOUT_MS = 30_000;

/** D17: id thao tác = `a<chỉ số trong allowedActions>`. */
export const actionId = (index: number) => `a${index}`;

interface AgentSuggestionOut {
  signal_id: string;
  title: string;
  body: string;
  action_ids: string[];
}

interface AgentResponse {
  suggestions: AgentSuggestionOut[];
  degraded?: boolean;
}

export function buildAgentRequest(cif: string, world: WorldState, signals: SuggestionSignal[]): Record<string, unknown> {
  const { customer } = world;
  return {
    user_id: cif,
    today: goalToday(cif),
    customer: {
      monthly_income: customer.monthlyIncome,
      monthly_surplus: customer.monthlySurplus === "unknown" ? null : customer.monthlySurplus,
      salary_day: customer.salaryDay,
      risk_profile: customer.riskProfile,
    },
    goals: world.goals
      .filter((g) => g.status !== "draft" && g.status !== "closed")
      .map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        phase: String(goalStage(world, g).phase),
        target_amount: g.targetAmount,
        target_date: g.targetDate,
        value: goalValue(world, g).total,
        progress_pct: Math.round(progressPct(world, g) * 10) / 10,
        months_left: monthsLeft(world.clock.today, g.targetDate),
      })),
    signals: signals.map((s) => ({
      id: s.id,
      goal_id: s.goalId,
      kind: s.kind,
      rank: s.rank,
      facts: s.facts,
      allowed_actions: s.allowedActions.map((a, i) => ({ id: actionId(i), label: a.label })),
      fallback: { title: s.fallback.title, body: s.fallback.body },
    })),
    feedback: readSuggestionFeedback(cif).map((f) => ({ kind: f.kind, goal_id: f.goalId, ignored_count: f.ignoredCount })),
  };
}

const textLength = (s: string) => [...s].length;

/** Cùng điều kiện với `guard.check` của agent; null = được hiển thị. */
export function checkWording(signal: SuggestionSignal, out: AgentSuggestionOut): string | null {
  if (typeof out.title !== "string" || typeof out.body !== "string" || !Array.isArray(out.action_ids)) return "malformed";
  if (!out.title.trim() || !out.body.trim()) return "empty";
  if (textLength(out.title) > MAX_TITLE_LEN) return "title_too_long";
  if (textLength(out.body) > MAX_BODY_LEN) return "body_too_long";
  const allowedIds = new Set(signal.allowedActions.map((_, i) => actionId(i)));
  if (!out.action_ids.every((id) => typeof id === "string" && allowedIds.has(id))) return "unknown_action";
  const allowed = factKeys(signal.facts);
  for (const key of [...numberKeys(out.title), ...numberKeys(out.body)]) {
    if (!allowed.has(key)) return "number_not_in_facts";
  }
  return null;
}

async function callAgent(body: Record<string, unknown>): Promise<AgentResponse | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), AGENT_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([forwardToAgent("/goal-suggestions", body), timeout]);
    if (!res || !res.ok) return null;
    const data = (await res.json()) as AgentResponse;
    return Array.isArray(data?.suggestions) ? data : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Gọi agent viết lại lời cho các tín hiệu (chạy ở nền, không bao giờ chặn màn hình). */
export async function fetchAgentWording(cif: string, world: WorldState, signals: SuggestionSignal[]): Promise<void> {
  if (process.env.AGENT_MODE === "mock" || signals.length === 0) return;
  const data = await callAgent(buildAgentRequest(cif, world, signals));
  if (!data || data.degraded) return;
  const byId = new Map(signals.map((s) => [s.id, s]));
  for (const out of data.suggestions) {
    const signal = byId.get(out?.signal_id);
    if (!signal) continue;
    const reason = checkWording(signal, out);
    if (reason) {
      console.warn(`[goals-v2] agent wording rejected for ${signal.id}: ${reason}`);
      continue;
    }
    const ids = new Set(out.action_ids);
    saveAgentWording(cif, signal.id, signalFingerprint(signal), {
      title: out.title.trim(),
      body: out.body.trim(),
      actions: signal.allowedActions.filter((_, i) => ids.has(actionId(i))),
    });
  }
}
