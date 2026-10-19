import type { WorldState } from "../model/state";
import { hydrateMarket, type MarketInstrument } from "../data/market";
import type { PreviewAction } from "./actions";

export interface MarketPayload {
  instruments: MarketInstrument[];
  asOf: string | null;
  refreshing: boolean;
}

export interface WorldPayload {
  world: WorldState;
  market: MarketPayload;
}

const BASE = "/api/goals-v2";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const MARKET_POLL_MS = 3000;
const MARKET_POLL_MAX = 10;

/** Actions that stay on the client: navigation, toasts, local-only UI state, and the sync itself. */
export function isLocalOnlyAction(action: PreviewAction): boolean {
  return (
    action.type.startsWith("nav/") ||
    action.type.startsWith("toast/") ||
    action.type === "dismissSuggestion" ||
    action.type === "world/sync" ||
    action.type === "hydrate"
  );
}

export async function fetchWorld(cif: string): Promise<WorldPayload> {
  const res = await fetch(`${BASE}?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET goals-v2 ${res.status}`);
  return (await res.json()) as WorldPayload;
}

export async function fetchMarket(): Promise<MarketPayload> {
  const res = await fetch(`${BASE}/market`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET goals-v2/market ${res.status}`);
  return (await res.json()) as MarketPayload;
}

type ActionResult = { ok: true; payload: WorldPayload } | { ok: false; error: string; payload: WorldPayload | null };

async function postAction(cif: string, requestId: string, action: PreviewAction): Promise<ActionResult> {
  const res = await fetch(`${BASE}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, requestId, action }),
  });
  if (res.ok) return { ok: true, payload: (await res.json()) as WorldPayload };
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as (Partial<WorldPayload> & { error?: string }) | null;
    const payload = body?.world && body.market ? ({ world: body.world, market: body.market } as WorldPayload) : null;
    return { ok: false, error: body?.error ?? "Thao tác không được chấp nhận.", payload };
  }
  throw new Error(`POST goals-v2/actions ${res.status}`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SyncHandlers {
  /** Replace the data part of the store with the server world (also rehydrates the market list). */
  onWorld: (payload: WorldPayload) => void;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
}

/**
 * Sequential action queue. The UI never waits: callers enqueue after running the local reducer.
 * The server world is applied only when the queue drains, so a response never overwrites
 * optimistic changes that are still waiting to be sent.
 */
export class ActionQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private latest: WorldPayload | null = null;
  private generation = 0;

  constructor(private cif: string, private handlers: SyncHandlers) {}

  /** Stops applying results (persona changed / unmounted). Queued items drain silently. */
  dispose(): void {
    this.generation += 1;
    this.latest = null;
  }

  enqueue(action: PreviewAction): void {
    const gen = this.generation;
    const requestId = crypto.randomUUID();
    this.pending += 1;
    this.tail = this.tail.then(() => this.run(gen, requestId, action)).catch(() => undefined);
  }

  private async run(gen: number, requestId: string, action: PreviewAction): Promise<void> {
    try {
      if (gen !== this.generation) return;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await postAction(this.cif, requestId, action);
          if (gen !== this.generation) return;
          if (result.payload) this.latest = result.payload;
          if (!result.ok) this.handlers.onError(result.error);
          return;
        } catch {
          if (gen !== this.generation) return;
          if (attempt === MAX_ATTEMPTS) {
            this.handlers.onError("Không lưu được thay đổi. Vui lòng thử lại.");
            // Show what is actually saved; if this GET fails too, keep the local state.
            try {
              const payload = await fetchWorld(this.cif);
              if (gen === this.generation) this.latest = payload;
            } catch {
              // Leave local state and the toast.
            }
            return;
          }
          this.handlers.onInfo("Chưa lưu được, đang thử lại");
          await sleep(RETRY_DELAY_MS);
        }
      }
    } finally {
      this.pending -= 1;
      if (this.pending === 0 && this.latest && gen === this.generation) {
        const payload = this.latest;
        this.latest = null;
        this.handlers.onWorld(payload);
      }
    }
  }
}

/** Polls the market endpoint while the server is refreshing prices. Returns a cancel function. */
export function pollMarket(onFresh: () => void, onDone: () => void): () => void {
  let cancelled = false;
  (async () => {
    for (let i = 0; i < MARKET_POLL_MAX && !cancelled; i += 1) {
      await sleep(MARKET_POLL_MS);
      if (cancelled) return;
      try {
        const market = await fetchMarket();
        if (cancelled) return;
        hydrateMarket(market.instruments);
        onFresh();
        if (!market.refreshing) break;
      } catch {
        // Keep polling; prices are never blocking.
      }
    }
    if (!cancelled) onDone();
  })();
  return () => {
    cancelled = true;
  };
}
