"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { AgentSuggestion, PreviewState } from "../model/state";
import type { ScreenEntry, ScreenId, ScreenParams } from "../model/screens";
import type { ToastTone } from "../model/types";
import type { PreviewAction } from "./actions";
import { initialPreviewState, previewReducer } from "./reducer";
import { ActionQueue, fetchWorld, isLocalOnlyAction, pollMarket, requestMarketRefresh, type GoalIdResolution, type WorldPayload } from "./server-sync";
import { hydrateMarket } from "../data/market";
import { usePersonaCif } from "@/providers/context";
import { usePanelActive } from "@/components/shell/PanelActive";

const SUGGESTIONS_URL = "/api/goals-v2/suggestions";
const SUGGESTION_POLL_MS = 3000;
const SUGGESTION_POLL_MAX = 10;

interface SuggestionsPayload {
  suggestions: AgentSuggestion[];
  refreshing: boolean;
}

async function fetchSuggestions(cif: string): Promise<SuggestionsPayload> {
  const res = await fetch(`${SUGGESTIONS_URL}?cif=${encodeURIComponent(cif)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET goals-v2/suggestions ${res.status}`);
  return (await res.json()) as SuggestionsPayload;
}

/** Fire-and-forget: a lost event only costs a log line. */
export function postSuggestionEvent(cif: string, suggestionId: string, event: "shown" | "clicked" | "dismissed" | "acted"): void {
  void fetch(`${SUGGESTIONS_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cif, suggestionId, event }),
  }).catch(() => undefined);
}

/** Window event the shell's edge-swipe back fires on /goals-preview (see AppChrome). */
export const PREVIEW_BACK_EVENT = "goals-preview:back";

export interface PreviewNav {
  stack: ScreenEntry[];
  current: ScreenEntry;
  canGoBack: boolean;
  updateParams: (params: ScreenParams) => void;
  push: (screen: ScreenId, params?: ScreenParams) => void;
  replace: (screen: ScreenId, params?: ScreenParams) => void;
  pop: (count?: number) => void;
  popTo: (screen: ScreenId) => void;
  reset: (screen?: ScreenId, params?: ScreenParams) => void;
}

interface PreviewContextValue {
  state: PreviewState;
  dispatch: (action: PreviewAction) => void;
  nav: PreviewNav;
  toast: (message: string, tone?: ToastTone) => void;
  /** True once the server world of the active customer has loaded. */
  hydrated: boolean;
  /** "loading" until the first server world arrives; "error" when that GET failed. */
  loadStatus: LoadStatus;
  /** Retries the world GET after an error. */
  reload: () => void;
  /** Server suggestions ("M-You gợi ý"); null until the first load (or when it failed). */
  suggestions: AgentSuggestion[] | null;
  /** Records a click on a suggestion button ("clicked" for navigation, "acted" for a store action). */
  recordSuggestionEvent: (suggestionId: string, event: "clicked" | "acted") => void;
  /** Asks the server to re-fetch market prices in the background; never blocks. */
  refreshPrices: () => void;
  /** True while a price refresh started by `refreshPrices` is still running. */
  pricesRefreshing: boolean;
}

export type LoadStatus = "loading" | "ready" | "error";

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Loads the server world for the active persona, then keeps every business action in sync:
 * the local reducer runs first (the UI never waits) and the action is queued to the server.
 * The old `goals-preview:v1` localStorage key is no longer read or written (and not deleted).
 */
function useServerWorld(
  rawDispatch: (a: PreviewAction) => void,
  stateRef: MutableRefObject<PreviewState>,
  cif: string | null,
  entryScreen?: ScreenId,
): {
  loadStatus: LoadStatus;
  reload: () => void;
  dispatch: (a: PreviewAction) => void;
  suggestions: AgentSuggestion[] | null;
  recordSuggestionEvent: (suggestionId: string, event: "clicked" | "acted") => void;
  refreshPrices: () => void;
  pricesRefreshing: boolean;
} {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);
  const [suggestions, setSuggestions] = useState<AgentSuggestion[] | null>(null);
  const suggestionRunRef = useRef(0);
  const queueRef = useRef<ActionQueue | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  /** Loads suggestions without blocking anything; while the server waits for the agent, asks again every 3 s (max 10). */
  const loadSuggestions = useCallback((cif: string) => {
    const run = ++suggestionRunRef.current;
    void (async () => {
      for (let i = 0; i <= SUGGESTION_POLL_MAX; i += 1) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, SUGGESTION_POLL_MS));
        if (run !== suggestionRunRef.current) return;
        try {
          const payload = await fetchSuggestions(cif);
          if (run !== suggestionRunRef.current) return;
          setSuggestions(payload.suggestions);
          if (!payload.refreshing) return;
        } catch {
          if (i === 0) return;
        }
      }
    })();
  }, []);

  const applyPayload = useCallback(
    (payload: WorldPayload, ids?: GoalIdResolution) => {
      hydrateMarket(payload.market.instruments);
      rawDispatch({ type: "world/sync", world: payload.world, goalIdMap: ids?.goalIdMap, unsavedGoalIds: ids?.unsavedGoalIds });
      if (cif) loadSuggestions(cif);
      if (payload.market.refreshing && !cancelPollRef.current) {
        cancelPollRef.current = pollMarket(
          () => {
            const { nav: _nav, toasts: _toasts, dismissedSuggestionIds: _d, lastCreatedGoalId: _l, navSeq: _n, ...world } = stateRef.current;
            rawDispatch({ type: "world/sync", world });
          },
          () => {
            cancelPollRef.current = null;
          },
        );
      }
    },
    [rawDispatch, stateRef, cif, loadSuggestions],
  );

  useEffect(() => {
    let alive = true;
    suggestionRunRef.current += 1;
    setSuggestions(null);
    queueRef.current?.dispose();
    queueRef.current = null;
    cancelPollRef.current?.();
    cancelPollRef.current = null;
    setPricesRefreshing(false);
    // New customer (or retry): drop the previous world/nav and wait for the server world.
    setLoadStatus("loading");
    rawDispatch({ type: "hydrate", state: initialPreviewState() });
    if (entryScreen) rawDispatch({ type: "nav/reset", screen: entryScreen });
    if (!cif) return;
    fetchWorld(cif)
      .then((payload) => {
        if (!alive) return;
        applyPayload(payload);
        setLoadStatus("ready");
        queueRef.current = new ActionQueue(cif, {
          onWorld: applyPayload,
          onError: (message) => {
            const last = stateRef.current.toasts[stateRef.current.toasts.length - 1];
            if (last?.message !== message) rawDispatch({ type: "toast/push", message, tone: "error" });
          },
          onInfo: (message) => rawDispatch({ type: "toast/push", message, tone: "warning" }),
        });
      })
      .catch(() => {
        if (alive) setLoadStatus("error");
      });
    return () => {
      alive = false;
      queueRef.current?.dispose();
      queueRef.current = null;
      cancelPollRef.current?.();
      suggestionRunRef.current += 1;
    };
  }, [cif, entryScreen, reloadKey, rawDispatch, applyPayload, stateRef]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const dispatch = useCallback(
    (action: PreviewAction) => {
      const local = isLocalOnlyAction(action);
      // No server world yet (loading / failed): business actions are locked, nothing runs locally or is queued.
      if (!local && !queueRef.current) return;
      // The temporary id the reducer gives a new goal (pure reducer: same result as the dispatch below).
      const localGoalId = action.type === "createGoal" ? previewReducer(stateRef.current, action).lastCreatedGoalId : undefined;
      rawDispatch(action);
      if (!local) queueRef.current?.enqueue(action, localGoalId);
      // "Để sau" / "Ẩn gợi ý": the server hides the suggestion for 7 days.
      if (action.type === "dismissSuggestion" && cif) postSuggestionEvent(cif, action.id, "dismissed");
    },
    [rawDispatch, stateRef, cif],
  );

  const recordSuggestionEvent = useCallback(
    (suggestionId: string, event: "clicked" | "acted") => {
      if (cif) postSuggestionEvent(cif, suggestionId, event);
    },
    [cif],
  );

  /** "Cập nhật lại": starts a server price sync (not awaited by the UI), then polls like the first load. */
  const refreshPrices = useCallback(() => {
    if (!cif || pricesRefreshing) return;
    setPricesRefreshing(true);
    const resync = () => {
      const { nav: _nav, toasts: _toasts, dismissedSuggestionIds: _d, lastCreatedGoalId: _l, navSeq: _n, ...world } = stateRef.current;
      rawDispatch({ type: "world/sync", world });
    };
    void requestMarketRefresh()
      .then((market) => {
        hydrateMarket(market.instruments);
        resync();
        if (!market.refreshing) {
          setPricesRefreshing(false);
          return;
        }
        cancelPollRef.current?.();
        cancelPollRef.current = pollMarket(resync, () => {
          cancelPollRef.current = null;
          setPricesRefreshing(false);
        });
      })
      .catch(() => setPricesRefreshing(false));
  }, [cif, pricesRefreshing, rawDispatch, stateRef]);

  return { loadStatus, reload, dispatch, suggestions, recordSuggestionEvent, refreshPrices, pricesRefreshing };
}

export function PreviewStoreProvider({ children, entryScreen }: { children: ReactNode; entryScreen?: ScreenId }) {
  const active = usePanelActive();
  const cif = usePersonaCif();
  const [state, rawDispatch] = useReducer(previewReducer, undefined, initialPreviewState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const { loadStatus, reload, dispatch, suggestions, recordSuggestionEvent, refreshPrices, pricesRefreshing } = useServerWorld(rawDispatch, stateRef, cif, entryScreen);

  useEffect(() => {
    const onBack = (event: Event) => {
      if (!active || state.nav.stack.length <= 1) return;
      event.preventDefault();
      dispatch({ type: "nav/pop" });
    };
    window.addEventListener(PREVIEW_BACK_EVENT, onBack);
    return () => window.removeEventListener(PREVIEW_BACK_EVENT, onBack);
  }, [active, state.nav.stack.length, dispatch]);

  const stack = state.nav.stack;
  const updateParams = useCallback((params: ScreenParams) => dispatch({ type: "nav/params", params }), [dispatch]);
  const push = useCallback((screen: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/push", screen, params }), [dispatch]);
  const replace = useCallback((screen: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/replace", screen, params }), [dispatch]);
  const pop = useCallback((count?: number) => dispatch({ type: "nav/pop", count }), [dispatch]);
  const popTo = useCallback((screen: ScreenId) => dispatch({ type: "nav/popTo", screen }), [dispatch]);
  const reset = useCallback((screen?: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/reset", screen, params }), [dispatch]);
  const toast = useCallback((message: string, tone?: ToastTone) => dispatch({ type: "toast/push", message, tone }), [dispatch]);

  const nav = useMemo<PreviewNav>(
    () => ({ stack, current: stack[stack.length - 1], canGoBack: stack.length > 1, updateParams, push, replace, pop, popTo, reset }),
    [stack, updateParams, push, replace, pop, popTo, reset],
  );

  const value = useMemo(
    () => ({ state, dispatch, nav, toast, hydrated: loadStatus === "ready", loadStatus, reload, suggestions, recordSuggestionEvent, refreshPrices, pricesRefreshing }),
    [state, dispatch, nav, toast, loadStatus, reload, suggestions, recordSuggestionEvent, refreshPrices, pricesRefreshing],
  );
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used inside <PreviewStoreProvider>");
  return ctx;
}

export function usePreviewState(): PreviewState {
  return usePreview().state;
}

export function usePreviewDispatch(): (action: PreviewAction) => void {
  return usePreview().dispatch;
}

export function useNav(): PreviewNav {
  return usePreview().nav;
}
