import "server-only";

import { AGENT_BASE_URL, agentAuthHeaders } from "@/lib/agent-proxy-auth";
import { goalsV2Db } from "./db";
import { getWorld } from "./goal-service";

/**
 * Thẻ "M-You gợi ý" của một mục tiêu. pfm không tính gì: agent (`POST /goal-suggestions`) đọc dữ liệu và viết;
 * ở đây chỉ lưu bản gần nhất và quyết định KHI NÀO hỏi lại agent (xem `agent-docs/agent-to-backend/goals/goal-suggestions.md`).
 *
 * Mở màn luôn trả bản đã lưu, không chờ model. Bản được coi là cũ ("bẩn") khi: chưa có bản nào, `world.seq` đổi
 * (mọi thao tác trên mục tiêu), sang ngày mới (kể cả tua đồng hồ), hoặc quá `MAX_AGE_MS` (giá thị trường, chi tiêu, lương
 * đổi mà không chạm vào mục tiêu). Khi bẩn, hỏi lại agent ở nền kèm fingerprint cũ; agent trả `unchanged` thì không gọi model.
 * Agent lỗi thì giữ bản cũ và chỉ thử lại sau `RETRY_MS`.
 */

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RETRY_MS = 5 * 60 * 1000;

export interface GoalInsight {
  goalId: string;
  goalName: string;
  observation: string;
  suggestion: string;
  /** Câu hỏi do agent viết ở ngôi của khách; "Chi tiết" gửi nguyên văn sang chat. Bản lưu cũ có thể chưa có. */
  question?: string;
}

export interface GoalInsightResult {
  insight: GoalInsight | null;
  /** Đang hỏi lại agent ở nền: client nên đọc lại sau vài giây. */
  refreshing: boolean;
}

export interface AgentAnswer {
  insight: GoalInsight | null;
  fingerprint: string | null;
  unchanged: boolean;
}

export type AskAgent = (cif: string, goalId: string, previousFingerprint: string | null) => Promise<AgentAnswer>;

interface Row {
  insight_json: string | null;
  fingerprint: string | null;
  world_seq: number;
  day: string;
  generated_at: number;
  attempted_at: number;
  failed: number;
}

const inFlight = new Map<string, Promise<void>>();

function table() {
  const db = goalsV2Db();
  db.exec(`CREATE TABLE IF NOT EXISTS gv2_goal_insights (
    cif TEXT NOT NULL, goal_id TEXT NOT NULL, insight_json TEXT, fingerprint TEXT,
    world_seq INTEGER NOT NULL, day TEXT NOT NULL, generated_at INTEGER NOT NULL, attempted_at INTEGER NOT NULL, failed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (cif, goal_id)
  )`);
  return db;
}

export const askAgent: AskAgent = async (cif, goalId, previousFingerprint) => {
  const res = await fetch(`${AGENT_BASE_URL}/goal-suggestions`, {
    method: "POST",
    headers: await agentAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ user_id: cif, goal_id: goalId, ...(previousFingerprint ? { previous_fingerprint: previousFingerprint } : {}) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Agent API error ${res.status}`);
  const body = (await res.json()) as {
    insight: { goal_id: string; goal_name: string; observation: string; suggestion: string; question?: string } | null;
    fingerprint?: string | null;
    unchanged?: boolean;
  };
  const i = body.insight;
  return {
    insight: i ? { goalId: i.goal_id, goalName: i.goal_name, observation: i.observation, suggestion: i.suggestion, ...(i.question ? { question: i.question } : {}) } : null,
    fingerprint: body.fingerprint ?? null,
    unchanged: body.unchanged === true,
  };
};

function parse(row: Row | undefined): GoalInsight | null {
  if (!row?.insight_json) return null;
  try {
    return JSON.parse(row.insight_json) as GoalInsight;
  } catch {
    return null;
  }
}

async function refresh(cif: string, goalId: string, seq: number, day: string, previous: Row | undefined, ask: AskAgent, now: () => number) {
  const db = table();
  const fail = () =>
    db
      .prepare(
        `INSERT INTO gv2_goal_insights (cif, goal_id, insight_json, fingerprint, world_seq, day, generated_at, attempted_at, failed) VALUES (?, ?, NULL, NULL, ?, ?, 0, ?, 1)
         ON CONFLICT(cif, goal_id) DO UPDATE SET attempted_at = excluded.attempted_at, failed = 1`,
      )
      .run(cif, goalId, seq, day, now());
  try {
    const answer = await ask(cif, goalId, previous?.fingerprint ?? null);
    const at = now();
    if (answer.unchanged && previous?.insight_json) {
      db.prepare("UPDATE gv2_goal_insights SET world_seq = ?, day = ?, generated_at = ?, attempted_at = ?, failed = 0 WHERE cif = ? AND goal_id = ?").run(seq, day, at, at, cif, goalId);
    } else if (answer.insight) {
      db.prepare(
        `INSERT INTO gv2_goal_insights (cif, goal_id, insight_json, fingerprint, world_seq, day, generated_at, attempted_at, failed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(cif, goal_id) DO UPDATE SET insight_json = excluded.insight_json, fingerprint = excluded.fingerprint, world_seq = excluded.world_seq, day = excluded.day,
           generated_at = excluded.generated_at, attempted_at = excluded.attempted_at, failed = 0`,
      ).run(cif, goalId, JSON.stringify(answer.insight), answer.fingerprint, seq, day, at, at);
    } else {
      fail();
    }
  } catch (err) {
    console.error("goal insight refresh failed", cif, goalId, err instanceof Error ? err.message : err);
    fail();
  }
}

/** Bản đã lưu của mục tiêu; nếu cũ thì khởi động việc làm mới ở nền (không chờ). Ném `RangeError` nếu không có khách / mục tiêu. */
export function readGoalInsight(cif: string, goalId: string, ask: AskAgent = askAgent, now: () => number = Date.now): GoalInsightResult {
  const { world } = getWorld(cif);
  const goal = world.goals.find((g) => g.id === goalId);
  if (!goal) throw new RangeError("goal not found");
  const row = table().prepare("SELECT * FROM gv2_goal_insights WHERE cif = ? AND goal_id = ?").get(cif, goalId) as Row | undefined;
  const key = `${cif}:${goalId}`;
  const running = inFlight.has(key);
  const live = goal.status === "accumulating" || goal.status === "repaying";
  const stale = !row || !row.insight_json || row.world_seq !== world.seq || row.day !== world.clock.today || now() - row.generated_at > MAX_AGE_MS;
  const cooling = !!row && row.failed === 1 && now() - row.attempted_at < RETRY_MS;
  if (live && stale && !cooling && !running) {
    const task = refresh(cif, goalId, world.seq, world.clock.today, row, ask, now).finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return { insight: parse(row), refreshing: true };
  }
  return { insight: parse(row), refreshing: running };
}

/** Bản đã lưu, chỉ đọc: không đụng tới world, không khởi động làm mới. Cho agent chat đọc lại đúng thẻ khách đã thấy. */
export function peekGoalInsight(cif: string, goalId: string): GoalInsight | null {
  return parse(table().prepare("SELECT * FROM gv2_goal_insights WHERE cif = ? AND goal_id = ?").get(cif, goalId) as Row | undefined);
}

/** Chỉ cho test: chờ các lần làm mới đang chạy. */
export function settleGoalInsights(): Promise<unknown> {
  return Promise.all([...inFlight.values()]);
}
