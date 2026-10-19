"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { PreviewState } from "../model/state";
import type { ScreenEntry, ScreenId, ScreenParams } from "../model/screens";
import type { ToastTone } from "../model/types";
import type { PreviewAction } from "./actions";
import { STORAGE_KEY, initialPreviewState, previewReducer } from "./reducer";
import { usePanelActive } from "@/components/shell/PanelActive";

/** Window event the shell's edge-swipe back fires on /goals-preview (see AppChrome). */
export const PREVIEW_BACK_EVENT = "goals-preview:back";

export interface PreviewNav {
  stack: ScreenEntry[];
  current: ScreenEntry;
  canGoBack: boolean;
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
  /** False until localStorage has been read (avoid flashing default data). */
  hydrated: boolean;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

function isPreviewState(value: unknown): value is PreviewState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PreviewState>;
  return v.version === 1 && Array.isArray(v.goals) && Array.isArray(v.nav?.stack) && v.nav.stack.length > 0 && !!v.clock?.today;
}

function useHydrated(dispatch: (a: PreviewAction) => void, entryScreen?: ScreenId): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isPreviewState(parsed)) dispatch({ type: "hydrate", state: { ...parsed, toasts: [] } });
      }
    } catch {
      // Corrupt or blocked storage: keep the default scenario.
    }
    if (entryScreen) dispatch({ type: "nav/reset", screen: entryScreen });
    setHydrated(true);
  }, [dispatch, entryScreen]);
  return hydrated;
}

export function PreviewStoreProvider({ children, entryScreen }: { children: ReactNode; entryScreen?: ScreenId }) {
  const active = usePanelActive();
  const [state, dispatch] = useReducer(previewReducer, undefined, initialPreviewState);
  const hydrated = useHydrated(dispatch, entryScreen);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, toasts: [] }));
    } catch {
      // Storage full / disabled: the prototype still works in memory.
    }
  }, [state, hydrated]);

  useEffect(() => {
    const onBack = (event: Event) => {
      if (!active || state.nav.stack.length <= 1) return;
      event.preventDefault();
      dispatch({ type: "nav/pop" });
    };
    window.addEventListener(PREVIEW_BACK_EVENT, onBack);
    return () => window.removeEventListener(PREVIEW_BACK_EVENT, onBack);
  }, [active, state.nav.stack.length]);

  const stack = state.nav.stack;
  const push = useCallback((screen: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/push", screen, params }), []);
  const replace = useCallback((screen: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/replace", screen, params }), []);
  const pop = useCallback((count?: number) => dispatch({ type: "nav/pop", count }), []);
  const popTo = useCallback((screen: ScreenId) => dispatch({ type: "nav/popTo", screen }), []);
  const reset = useCallback((screen?: ScreenId, params?: ScreenParams) => dispatch({ type: "nav/reset", screen, params }), []);
  const toast = useCallback((message: string, tone?: ToastTone) => dispatch({ type: "toast/push", message, tone }), []);

  const nav = useMemo<PreviewNav>(
    () => ({ stack, current: stack[stack.length - 1], canGoBack: stack.length > 1, push, replace, pop, popTo, reset }),
    [stack, push, replace, pop, popTo, reset],
  );

  const value = useMemo(() => ({ state, dispatch, nav, toast, hydrated }), [state, nav, toast, hydrated]);
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
