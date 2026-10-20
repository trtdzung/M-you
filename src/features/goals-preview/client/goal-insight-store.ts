import { useSyncExternalStore } from "react";

/**
 * Thẻ "M-You gợi ý" của mọi mục tiêu, giữ trong state phía client. Nạp một lần khi danh sách mục tiêu tải xong và
 * nạp lại sau mỗi thao tác lên mục tiêu, nên mở chi tiết là có thẻ ngay — không còn gọi riêng cho từng lần mở.
 */
export interface StoredInsight {
  goalName: string;
  observation: string;
  suggestion: string;
  question?: string;
}

const POLL_MS = 4000;
const POLL_TRIES = 8;

let owner: string | null = null;
let insights: Record<string, StoredInsight | null> = {};
const listeners = new Set<() => void>();
let pending = false; // đang nạp, hoặc server còn đang viết bản mới ở nền
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function publish(next: Record<string, StoredInsight | null>, isPending = pending) {
  insights = next;
  pending = isPending;
  listeners.forEach((l) => l());
}

/** Đọc lại thẻ của khách từ server; server đang viết bản mới ở nền thì hỏi lại vài lần. Lỗi mạng giữ nguyên bản đang có. */
export function syncGoalInsights(cif: string | null): void {
  if (timer) clearTimeout(timer);
  const run = ++generation;
  if (!cif) {
    owner = null;
    publish({}, false);
    return;
  }
  if (owner !== cif) {
    owner = cif;
    publish({}, true);
  } else if (!pending) {
    publish(insights, true);
  }
  async function load(tries: number) {
    try {
      const res = await fetch(`/api/goals-v2/insight?cif=${encodeURIComponent(cif!)}`, { cache: "no-store" });
      if (run !== generation) return;
      if (!res.ok) return publish(insights, false);
      const body = (await res.json()) as { insights: Record<string, StoredInsight | null>; refreshing: boolean };
      if (run !== generation) return;
      // Không để một bản chưa kịp viết xoá thẻ đang hiện.
      const merged = { ...insights };
      for (const [id, value] of Object.entries(body.insights)) if (value || !(id in merged)) merged[id] = value ?? merged[id] ?? null;
      const again = body.refreshing && tries > 0;
      publish(merged, again);
      if (again) timer = setTimeout(() => void load(tries - 1), POLL_MS);
    } catch {
      if (run === generation) publish(insights, false);
    }
  }
  void load(POLL_TRIES);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGoalInsight(goalId: string): StoredInsight | null {
  return useSyncExternalStore(subscribe, () => insights[goalId] ?? null, () => null);
}

/** True khi thẻ của mục tiêu chưa có nhưng đang được nạp / viết: thẻ hiện "M-You đang xem xét…". */
export function useGoalInsightPending(): boolean {
  return useSyncExternalStore(subscribe, () => pending, () => false);
}

/** Chỉ cho test. */
export function resetGoalInsights(): void {
  generation++;
  if (timer) clearTimeout(timer);
  owner = null;
  publish({}, false);
}
