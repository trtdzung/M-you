"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { PreviewState } from "../model/state";
import type { ScreenEntry, ScreenId, ScreenParams } from "../model/screens";
import type { ToastTone } from "../model/types";
import type { PreviewAction } from "./actions";
import { initialPreviewState, previewReducer } from "./reducer";
import { ActionQueue, fetchWorld, isLocalOnlyAction, pollMarket, type WorldPayload } from "./server-sync";
import { hydrateMarket } from "../data/market";
import { usePersonaCif } from "@/providers/context";
import { usePanelActive } from "@/components/shell/PanelActive";

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
  /** False until the first server world has loaded (avoid flashing default data). */
  hydrated: boolean;
}

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
): { hydrated: boolean; dispatch: (a: PreviewAction) => void } {
  const [hydrated, setHydrated] = useState(false);
  const queueRef = useRef<ActionQueue | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  const applyPayload = useCallback(
    (payload: WorldPayload) => {
      hydrateMarket(payload.market.instruments);
      rawDispatch({ type: "world/sync", world: payload.world });
      if (payload.market.refreshing && !cancelPollRef.current) {
        cancelPollRef.current = pollMarket(
          () => {
            const { nav: _nav, toasts: _toasts, dismissedSuggestionIds: _d, lastCreatedGoalId: _l, ...world } = stateRef.current;
            rawDispatch({ type: "world/sync", world });
          },
          () => {
            cancelPollRef.current = null;
          },
        );
      }
    },
    [rawDispatch, stateRef],
  );

  useEffect(() => {
    let alive = true;
    queueRef.current?.dispose();
    queueRef.current = null;
    cancelPollRef.current?.();
    cancelPollRef.current = null;
    if (entryScreen) rawDispatch({ type: "nav/reset", screen: entryScreen });
    if (!cif) {
      setHydrated(true);
      return;
    }
    fetchWorld(cif)
      .then((payload) => {
        if (!alive) return;
        applyPayload(payload);
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
        if (alive) rawDispatch({ type: "toast/push", message: "Không tải được dữ liệu mục tiêu.", tone: "error" });
      })
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
      queueRef.current?.dispose();
      queueRef.current = null;
      cancelPollRef.current?.();
    };
  }, [cif, entryScreen, rawDispatch, applyPayload, stateRef]);

  const dispatch = useCallback(
    (action: PreviewAction) => {
      rawDispatch(action);
      if (!isLocalOnlyAction(action)) queueRef.current?.enqueue(action);
    },
    [rawDispatch],
  );

  return { hydrated, dispatch };
}

export function PreviewStoreProvider({ children, entryScreen }: { children: ReactNode; entryScreen?: ScreenId }) {
  const active = usePanelActive();
  const cif = usePersonaCif();
  const [state, rawDispatch] = useReducer(previewReducer, undefined, initialPreviewState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const { hydrated, dispatch } = useServerWorld(rawDispatch, stateRef, cif, entryScreen);

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

  const value = useMemo(() => ({ state, dispatch, nav, toast, hydrated }), [state, dispatch, nav, toast, hydrated]);
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
