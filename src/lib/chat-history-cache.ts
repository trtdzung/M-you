import { getChatHistory, type ChatHistoryResponse } from "@/lib/agent-api";

/**
 * The M-You chat thread, fetched ahead of time. Screens without the chat widget (Mục tiêu, Home…) call
 * `prefetchChatHistory` so that the widget, mounted when the customer lands on /pfm?assistant=1, starts from a
 * thread that is already there instead of fetching it first.
 */
const MAX_AGE_MS = 60_000;

interface Entry {
  cif: string;
  at: number;
  promise: Promise<ChatHistoryResponse>;
  value?: ChatHistoryResponse;
}

let entry: Entry | null = null;

const fresh = (cif: string) => (entry && entry.cif === cif && Date.now() - entry.at < MAX_AGE_MS ? entry : null);

export function prefetchChatHistory(cif: string): void {
  if (!cif || fresh(cif)) return;
  const next: Entry = { cif, at: Date.now(), promise: getChatHistory(cif) };
  entry = next;
  next.promise.then(
    (value) => { next.value = value; },
    () => { if (entry === next) entry = null; }, // a failed prefetch is not cached; the widget fetches itself
  );
}

/** The prefetched thread if it has already arrived, else null. */
export function peekChatHistory(cif: string): ChatHistoryResponse | null {
  return fresh(cif)?.value ?? null;
}

/** The prefetch still on its way, if any, so the widget can wait for it instead of starting a second request. */
export function pendingChatHistory(cif: string): Promise<ChatHistoryResponse> | null {
  const hit = fresh(cif);
  return hit && !hit.value ? hit.promise : null;
}

/** After the thread changed on this device (sent a turn, deleted it) the stored copy is out of date. */
export function dropChatHistory(): void {
  entry = null;
}
