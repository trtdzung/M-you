import "server-only";

/**
 * Lưu gợi ý của Mục tiêu (`gv2_suggestions`) và phản hồi của khách
 * (`gv2_suggestion_events`). Mỗi tín hiệu là 1 dòng theo `id`; `fingerprint`
 * = hash(kind, goalId, facts) — đổi fingerprint thì thay lời bằng bản viết sẵn
 * mới, giữ nguyên `dismissed_until` / `ignored_count`.
 */

import { createHash } from "node:crypto";
import { addDays } from "../../engine/dates";
import type { SuggestionAction } from "../../model/state";
import type { ISODate } from "../../model/types";
import { goalsV2Db } from "../db";
import type { SignalFacts, SignalHistory, SuggestionSignal } from "./signals";

export type SuggestionEvent = "shown" | "clicked" | "dismissed" | "acted";
export const SUGGESTION_EVENTS: readonly SuggestionEvent[] = ["shown", "clicked", "dismissed", "acted"];

/** "Để sau" ẩn gợi ý trong 7 ngày; bị bỏ qua từ 3 lần thì hạ xuống cuối. */
export const DISMISS_DAYS = 7;
export const DEMOTE_AFTER_IGNORED = 3;

export type WordingSource = "fallback" | "agent";

/** Lời đang hiển thị của một gợi ý. */
export interface SuggestionWording {
  title: string;
  body: string;
  actions: SuggestionAction[];
}

export interface StoredSuggestionPayload {
  signal: SuggestionSignal;
  wording: SuggestionWording;
  source: WordingSource;
}

export interface StoredSuggestion {
  id: string;
  goalId: string | null;
  kind: string;
  rank: number;
  fingerprint: string;
  payload: StoredSuggestionPayload;
  createdAt: string;
  dismissedUntil: ISODate | null;
  ignoredCount: number;
}

interface SuggestionRow {
  id: string;
  goal_id: string;
  kind: string;
  rank: number;
  fingerprint: string;
  payload: string;
  created_at: string;
  dismissed_until: string | null;
  ignored_count: number;
}

/** Cột `goal_id` là NOT NULL: tín hiệu toàn khách (goalId null) lưu bằng chuỗi rỗng. */
const NO_GOAL = "";

function fromRow(row: SuggestionRow): StoredSuggestion {
  return {
    id: row.id,
    goalId: row.goal_id === NO_GOAL ? null : row.goal_id,
    kind: row.kind,
    rank: row.rank,
    fingerprint: row.fingerprint,
    payload: JSON.parse(row.payload) as StoredSuggestionPayload,
    createdAt: row.created_at,
    dismissedUntil: row.dismissed_until,
    ignoredCount: row.ignored_count,
  };
}

function stableFacts(facts: SignalFacts): [string, number | string][] {
  return Object.keys(facts)
    .sort()
    .map((k) => [k, facts[k]]);
}

export function signalFingerprint(signal: Pick<SuggestionSignal, "kind" | "goalId" | "facts">): string {
  return createHash("sha256")
    .update(JSON.stringify([signal.kind, signal.goalId, stableFacts(signal.facts)]))
    .digest("hex")
    .slice(0, 32);
}

export function readSuggestions(cif: string): Map<string, StoredSuggestion> {
  const rows = goalsV2Db()
    .prepare(
      "SELECT id, goal_id, kind, rank, fingerprint, payload, created_at, dismissed_until, ignored_count FROM gv2_suggestions WHERE cif = ?",
    )
    .all(cif) as SuggestionRow[];
  return new Map(rows.map((r) => [r.id, fromRow(r)]));
}

/** Gợi ý khách đã bấm / làm theo (không tính "shown"). */
function engagedIds(cif: string): Set<string> {
  const rows = goalsV2Db()
    .prepare("SELECT DISTINCT suggestion_id AS id FROM gv2_suggestion_events WHERE cif = ? AND event IN ('clicked','acted','dismissed')")
    .all(cif) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/** Đầu vào cho `buildSignals`: đang để sau, bị bỏ qua nhiều, mốc tiến độ đã chúc mừng. */
export function readSignalHistory(cif: string, today: ISODate): SignalHistory {
  const hiddenIds = new Set<string>();
  const demotedIds = new Set<string>();
  for (const s of readSuggestions(cif).values()) {
    if (s.dismissedUntil && s.dismissedUntil > today) hiddenIds.add(s.id);
    if (s.ignoredCount >= DEMOTE_AFTER_IGNORED) demotedIds.add(s.id);
  }
  const celebratedIds = new Set([...engagedIds(cif)].filter((id) => id.startsWith("milestone:")));
  return { hiddenIds, demotedIds, celebratedIds };
}

export type UpsertResult = "created" | "changed" | "same";

/**
 * Ghi tín hiệu đã xếp hạng. Mới hoặc đổi fingerprint → lời viết sẵn (`fallback`) + sự kiện "shown";
 * cùng fingerprint → chỉ cập nhật hạng, giữ lời (có thể là lời của agent).
 */
export function upsertSignals(cif: string, signals: SuggestionSignal[], now: string): Map<string, UpsertResult> {
  const db = goalsV2Db();
  const existing = readSuggestions(cif);
  const results = new Map<string, UpsertResult>();
  const insert = db.prepare(
    `INSERT INTO gv2_suggestions (cif, id, goal_id, kind, rank, fingerprint, payload, created_at, dismissed_until, ignored_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
  );
  const replace = db.prepare(
    "UPDATE gv2_suggestions SET goal_id = ?, kind = ?, rank = ?, fingerprint = ?, payload = ?, created_at = ? WHERE cif = ? AND id = ?",
  );
  const rerank = db.prepare("UPDATE gv2_suggestions SET rank = ?, payload = ? WHERE cif = ? AND id = ?");
  const shown = db.prepare("INSERT INTO gv2_suggestion_events (cif, suggestion_id, event, created_at) VALUES (?, ?, 'shown', ?)");

  db.transaction(() => {
    for (const signal of signals) {
      const fingerprint = signalFingerprint(signal);
      const prev = existing.get(signal.id);
      const goalId = signal.goalId ?? NO_GOAL;
      if (prev && prev.fingerprint === fingerprint) {
        if (prev.rank !== signal.rank) {
          const payload: StoredSuggestionPayload = { ...prev.payload, signal: { ...prev.payload.signal, rank: signal.rank } };
          rerank.run(signal.rank, JSON.stringify(payload), cif, signal.id);
        }
        results.set(signal.id, "same");
        continue;
      }
      const payload: StoredSuggestionPayload = {
        signal,
        wording: { title: signal.fallback.title, body: signal.fallback.body, actions: signal.allowedActions },
        source: "fallback",
      };
      if (prev) {
        replace.run(goalId, signal.kind, signal.rank, fingerprint, JSON.stringify(payload), now, cif, signal.id);
        results.set(signal.id, "changed");
      } else {
        insert.run(cif, signal.id, goalId, signal.kind, signal.rank, fingerprint, JSON.stringify(payload), now);
        results.set(signal.id, "created");
      }
      shown.run(cif, signal.id, now);
    }
  })();
  return results;
}

/**
 * Lưu lời của agent cho một gợi ý (T9 gọi sau khi đã kiểm tra số ⊆ facts, action ⊆ allowed).
 * Bỏ qua (false) nếu fingerprint đã đổi trong lúc chờ agent.
 */
export function saveAgentWording(cif: string, suggestionId: string, fingerprint: string, wording: SuggestionWording): boolean {
  const db = goalsV2Db();
  return db.transaction(() => {
    const prev = readSuggestions(cif).get(suggestionId);
    if (!prev || prev.fingerprint !== fingerprint) return false;
    const payload: StoredSuggestionPayload = { ...prev.payload, wording, source: "agent" };
    db.prepare("UPDATE gv2_suggestions SET payload = ? WHERE cif = ? AND id = ?").run(JSON.stringify(payload), cif, suggestionId);
    return true;
  })();
}

/** Phản hồi gửi kèm request agent: số lần khách bỏ qua theo loại + mục tiêu. */
export function readSuggestionFeedback(cif: string): { kind: string; goalId: string | null; ignoredCount: number }[] {
  return [...readSuggestions(cif).values()]
    .filter((s) => s.ignoredCount > 0)
    .map((s) => ({ kind: s.kind, goalId: s.goalId, ignoredCount: s.ignoredCount }));
}

/**
 * Ghi một sự kiện của khách. "dismissed" (Để sau) → `dismissed_until = today + 7 ngày`, `ignored_count + 1`.
 * Trả false khi gợi ý không tồn tại.
 */
export function recordSuggestionEvent(cif: string, suggestionId: string, event: SuggestionEvent, today: ISODate, now: string): boolean {
  const db = goalsV2Db();
  return db.transaction(() => {
    const found = db.prepare("SELECT 1 AS x FROM gv2_suggestions WHERE cif = ? AND id = ?").get(cif, suggestionId);
    if (!found) return false;
    db.prepare("INSERT INTO gv2_suggestion_events (cif, suggestion_id, event, created_at) VALUES (?, ?, ?, ?)").run(
      cif,
      suggestionId,
      event,
      now,
    );
    if (event === "dismissed") {
      db.prepare(
        "UPDATE gv2_suggestions SET dismissed_until = ?, ignored_count = ignored_count + 1 WHERE cif = ? AND id = ?",
      ).run(addDays(today, DISMISS_DAYS), cif, suggestionId);
    }
    return true;
  })();
}
