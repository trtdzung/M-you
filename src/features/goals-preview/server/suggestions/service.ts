import "server-only";

/**
 * Gợi ý "M-You gợi ý" của Mục tiêu từ dữ liệu thật. `getSuggestions` luôn trả ngay
 * bản đã lưu (lời agent hoặc lời viết sẵn), không bao giờ chờ agent; tín hiệu mới
 * hoặc đổi số liệu → lưu lời viết sẵn ngay và gọi agent viết lại ở nền.
 */

import type { AgentSuggestion, WorldState } from "../../model/state";
import { goalToday } from "../clock";
import { getWorld } from "../goal-service";
import { buildSignals, cardKindOf, type SuggestionSignal } from "./signals";
import {
  readSignalHistory,
  readSuggestions,
  recordSuggestionEvent,
  upsertSignals,
  type SuggestionEvent,
  type WordingSource,
} from "./store";

export interface GoalSuggestionsResult {
  suggestions: AgentSuggestion[];
  /** "agent" khi mọi thẻ đã có lời của agent, còn lại "fallback". */
  source: WordingSource;
  /** Đang chờ agent viết lại lời → client hỏi lại sau. */
  refreshing: boolean;
}

/**
 * Hook gọi agent viết lại lời cho các tín hiệu (T9 nối). Chạy ở nền, kết quả hợp lệ
 * lưu bằng `saveAgentWording`. Hiện để trống.
 */
export async function requestAgentWording(cif: string, world: WorldState, signals: SuggestionSignal[]): Promise<void> {
  void cif;
  void world;
  void signals;
}

/** cif đang có lời gọi agent chạy dở. */
const pending = new Set<string>();
/** Tín hiệu đổi trong lúc đang chờ agent → gọi lại 1 lần với bản mới nhất khi xong. */
const queued = new Map<string, { world: WorldState; signals: SuggestionSignal[] }>();

function startAgentWording(cif: string, world: WorldState, signals: SuggestionSignal[]): void {
  if (pending.has(cif)) {
    queued.set(cif, { world, signals });
    return;
  }
  pending.add(cif);
  void requestAgentWording(cif, world, signals)
    .catch((err) => console.error("[goals-v2] agent wording failed", err))
    .finally(() => {
      pending.delete(cif);
      const next = queued.get(cif);
      if (next) {
        queued.delete(cif);
        startAgentWording(cif, next.world, next.signals);
      }
    });
}

/** Sự kiện của khách trên một thẻ gợi ý; false khi gợi ý không tồn tại. */
export function recordEvent(cif: string, suggestionId: string, event: SuggestionEvent): boolean {
  return recordSuggestionEvent(cif, suggestionId, event, goalToday(cif), new Date().toISOString());
}

export function getSuggestions(cif: string): GoalSuggestionsResult {
  const { world } = getWorld(cif);
  const today = goalToday(cif);
  const signals = buildSignals(world, readSignalHistory(cif, today));
  const changes = upsertSignals(cif, signals, new Date().toISOString());
  if ([...changes.values()].some((c) => c !== "same")) startAgentWording(cif, world, signals);

  const stored = readSuggestions(cif);
  let allAgent = signals.length > 0;
  const suggestions: AgentSuggestion[] = [];
  for (const signal of signals) {
    const row = stored.get(signal.id);
    const wording = row?.payload.wording ?? { title: signal.fallback.title, body: signal.fallback.body, actions: signal.allowedActions };
    if (row?.payload.source !== "agent") allAgent = false;
    suggestions.push({
      id: signal.id,
      kind: cardKindOf(signal.kind),
      title: wording.title,
      body: wording.body,
      goalId: signal.goalId ?? undefined,
      tone: signal.fallback.tone,
      actions: wording.actions,
    });
  }
  return { suggestions, source: allAgent ? "agent" : "fallback", refreshing: pending.has(cif) };
}
