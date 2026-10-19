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

export async function requestMarketRefresh(): Promise<MarketPayload> {
  const res = await fetch(`${BASE}/market/refresh`, { method: "POST", cache: "no-store" });
  if (!res.ok) throw new Error(`POST goals-v2/market/refresh ${res.status}`);
  return (await res.json()) as MarketPayload;
}

type ActionResult =
  | { ok: true; payload: WorldPayload; createdGoalId?: string }
  | { ok: false; error: string; payload: WorldPayload | null };

async function postAction(cif: string, requestId: string, action: PreviewAction): Promise<ActionResult> {
  const res = await fetch(`${BASE}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, requestId, action }),
  });
  if (res.ok) {
    const body = (await res.json()) as WorldPayload & { createdGoalId?: unknown };
    const payload: WorldPayload = { world: body.world, market: body.market };
    return typeof body.createdGoalId === "string" && body.createdGoalId !== ""
      ? { ok: true, payload, createdGoalId: body.createdGoalId }
      : { ok: true, payload };
  }
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as (Partial<WorldPayload> & { error?: string }) | null;
    const payload = body?.world && body.market ? ({ world: body.world, market: body.market } as WorldPayload) : null;
    return { ok: false, error: body?.error ?? "Thao tác không được chấp nhận.", payload };
  }
  throw new Error(`POST goals-v2/actions ${res.status}`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How the client's temporary goal ids resolved: created on the server (local → server id), or not saved. */
export interface GoalIdResolution {
  goalIdMap: Record<string, string>;
  unsavedGoalIds: string[];
}

type IdCheck = (value: string) => boolean;

/** True when a goal reference matches. Other action fields are not goal ids. */
function referencesId(action: PreviewAction, match: IdCheck): boolean {
  return (
    ("goalId" in action && typeof action.goalId === "string" && match(action.goalId)) ||
    ("goalIds" in action && action.goalIds.some((id) => match(id)))
  );
}

/** Replaces only goal reference fields with the server ids. */
function mapGoalIds(action: PreviewAction, map: Record<string, string>): PreviewAction {
  const swap = (id: string) => (Object.hasOwn(map, id) ? map[id] : id);
  if ("goalId" in action && typeof action.goalId === "string") return { ...action, goalId: swap(action.goalId) };
  if ("goalIds" in action) return { ...action, goalIds: action.goalIds.map(swap) };
  return action;
}

export interface SyncHandlers {
  /** Replace the data part of the store with the server world (also rehydrates the market list) and resolve temporary goal ids. */
  onWorld: (payload: WorldPayload, ids: GoalIdResolution) => void;
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
  /** Temporary goal id → server id, from each accepted `createGoal` response (never guessed). */
  private goalIdMap: Record<string, string> = {};
  /** Temporary goal ids whose `createGoal` was rejected or never got through. */
  private unsavedGoalIds = new Set<string>();

  constructor(private cif: string, private handlers: SyncHandlers) {}

  /** Stops applying results (persona changed / unmounted). Queued items drain silently. */
  dispose(): void {
    this.generation += 1;
    this.latest = null;
    this.goalIdMap = {};
    this.unsavedGoalIds.clear();
  }

  /** `localGoalId`: the temporary id the client reducer gave the goal of a `createGoal`. */
  enqueue(action: PreviewAction, localGoalId?: string): void {
    const gen = this.generation;
    const requestId = crypto.randomUUID();
    this.pending += 1;
    this.tail = this.tail.then(() => this.run(gen, requestId, action, localGoalId)).catch(() => undefined);
  }

  /** Records the outcome of a `createGoal`: server id when accepted with one, otherwise "not saved". */
  private resolveCreate(localGoalId: string | undefined, createdGoalId: string | undefined): void {
    if (!localGoalId) return;
    if (createdGoalId) this.goalIdMap[localGoalId] = createdGoalId;
    else this.unsavedGoalIds.add(localGoalId);
  }

  private async run(gen: number, requestId: string, queued: PreviewAction, localGoalId?: string): Promise<void> {
    try {
      if (gen !== this.generation) return;
      // A later action that points at a goal that was never saved is not sent.
      if (referencesId(queued, (id) => this.unsavedGoalIds.has(id))) return;
      const action = mapGoalIds(queued, this.goalIdMap);
      const isCreate = action.type === "createGoal";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await postAction(this.cif, requestId, action);
          if (gen !== this.generation) return;
          if (result.payload) this.latest = result.payload;
          if (isCreate) this.resolveCreate(localGoalId, result.ok ? result.createdGoalId : undefined);
          if (!result.ok) this.handlers.onError(result.error);
          return;
        } catch {
          if (gen !== this.generation) return;
          if (attempt === MAX_ATTEMPTS) {
            if (isCreate) this.resolveCreate(localGoalId, undefined);
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
        const ids: GoalIdResolution = { goalIdMap: this.goalIdMap, unsavedGoalIds: [...this.unsavedGoalIds] };
        // The store switches to server ids on this sync; later actions already carry them.
        this.latest = null;
        this.goalIdMap = {};
        this.unsavedGoalIds.clear();
        this.handlers.onWorld(payload, ids);
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
